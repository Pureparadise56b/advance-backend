import { asyncHandler } from "../utils/asyncHandler.util.js";
import ApiError from "../utils/ApiError.util.js";
import { User } from "../models/user.model.js";
import {
  deleteCloudinary,
  uploadCloudinary,
} from "../utils/cloudinary.util.js";
import { ApiResponse } from "../utils/ApiResponse.util.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const cookieOptions = {
  httpOnly: true,
  secure: true,
};

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = await user.generateAccessToken();
    const refreshToken = await user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went worng while generating refresh and access token"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  // get user details from frontend
  const { username, email, fullname, password } = req.body;
  // console.log("BODY: ", req.body);

  // validation - not empty
  if (
    [fullname, username, email, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "all fields are required");
  }

  // check if user already exist: basis on username or email
  const existingUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existingUser) {
    throw new ApiError(409, "User already exists");
  }

  // check for avatar and images
  let avatarLocalPath;
  let coverImageLocalPath;

  // console.log("Req files: ", req.files);
  if (
    req.files &&
    Array.isArray(req.files.avatar) &&
    req.files.avatar.length > 0
  ) {
    avatarLocalPath = req.files.avatar[0].path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  // if available then upload in cloudinary, avatar checked
  const avatar = await uploadCloudinary(avatarLocalPath);
  const coverImage = await uploadCloudinary(coverImageLocalPath);
  if (!avatar) {
    throw new ApiError(503, "Upload file service is not available");
  }

  // create user object - create entry in db
  const user = await User.create({
    fullname,
    username: username.toLowerCase(),
    email,
    password,
    avatar: [avatar.url, avatar.public_id],
    coverImage: [coverImage?.secure_url, coverImage?.public_id] || ["", ""],
  });

  // remove password and refresh token field from response
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // check for user creation
  if (!createdUser) {
    throw new ApiError(500, "Error while registering the user");
  }
  // if create then return response
  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "user registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  // get details from user: email, password
  const { email, password } = req.body;

  // validate the fields : not empty
  if (!email) {
    throw new ApiError(400, "email is required");
  }

  if (!password) {
    throw new ApiError(400, "password is required");
  }

  // find entries in database
  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(404, "user does not exist");
  }
  // if found then match the password with db password
  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "password incorrect");
  }
  //if matched then generate access and refresh token
  // push refresh token into the entry
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  // send refresh and access token as a response cookie to the user
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  return res
    .status(200)
    .cookie("ACCESS_TOKEN", accessToken, cookieOptions)
    .cookie("REFRESH_TOKEN", refreshToken, cookieOptions)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "user loggedIn successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user.id,
    {
      $set: { refreshToken: "" },
    },
    {
      new: true,
    }
  );
  res
    .status(200)
    .clearCookie("ACCESS_TOKEN", cookieOptions)
    .clearCookie("REFRESH_TOKEN", cookieOptions)
    .json(new ApiResponse(200, {}, "user logout successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.REFRESH_TOKEN || req.body.REFRESH_TOKEN;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?.id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(401, "Refresh token expired");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
      user._id
    );

    res
      .status(200)
      .cookie("ACCESS_TOKEN", accessToken, cookieOptions)
      .cookie("REFRESH_TOKEN", refreshToken, cookieOptions)
      .json(new ApiResponse(200, {}, "tokens refreshed successfully"));
  } catch (error) {
    throw new ApiError(500, "something went wrong while refreshing the tokens");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user?.id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });
  res
    .status(200)
    .json(new ApiResponse(200, {}, "password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: req?.user },
        "current user fetched successfully"
      )
    );
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullname } = req.body;

  if (!fullname) {
    throw new ApiError(400, "all fields are required");
  }
  const user = await User.findByIdAndUpdate(
    req.user.id,
    {
      $set: {
        fullname,
      },
    },
    { new: true }
  ).select("-password");

  res
    .status(200)
    .json(new ApiResponse(200, user, "account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  let newAvatarPath;
  console.log(req.file);
  if (!req.file) {
    throw new ApiError(400, "image file is required");
  }
  newAvatarPath = req.file.path;

  const user = await User.findById(req.user?.id);

  const deletedAvatar = await deleteCloudinary(user.avatar[1]);
  if (!deletedAvatar) {
    throw new ApiError(503, "Error while deleting the image");
  }
  const newAvatar = await uploadCloudinary(newAvatarPath);
  if (!newAvatar) {
    throw new ApiError(503, "Error while uploading the image");
  }
  user.avatar = [];
  user.avatar.push(newAvatar?.secure_url);
  user.avatar.push(newAvatar?.public_id);
  await user.save({ validateBeforeSave: false });
  res
    .status(200)
    .json(new ApiResponse(200, newAvatar, "edit avatar successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  let newCoverImagePath;
  console.log(req.file);
  if (!req.file) {
    throw new ApiError(400, "image file is required");
  }
  newCoverImagePath = req.file.path;

  const user = await User.findById(req.user?.id);

  const deletedCoverImage = await deleteCloudinary(user.coverImage[1]);
  if (!deletedCoverImage) {
    throw new ApiError(503, "Error while deleting the image");
  }
  const newCoverImage = await uploadCloudinary(newCoverImagePath);
  if (!newCoverImage) {
    throw new ApiError(503, "Error while uploading the image");
  }
  user.coverImage = [];
  user.coverImage.push(newCoverImage?.secure_url);
  user.coverImage.push(newCoverImage?.public_id);
  await user.save({ validateBeforeSave: false });
  res
    .status(200)
    .json(new ApiResponse(200, newCoverImage, "edit avatar successfully"));
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "username is missing");
  }

  const channel = await User.aggregate([
    {
      $match: {
        username: username?.toLowerCase(),
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers",
        },
        subscribedChannelsCount: {
          $size: "$subscribedTo",
        },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?.id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        fullname: 1,
        username: 1,
        subscribersCount: 1,
        subscribedChannelsCount: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
        isSubscribed: 1,
      },
    },
  ]);

  console.log(channel);

  if (!channel?.length) {
    throw new ApiError(404, "channel does not exists");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, channel[0], "channel fetched successfully"));
});

const getUserWatchedHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user.id),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullname: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
  ]);
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].watchHistory,
        "watch history fetched successfully"
      )
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateUserAvatar,
  updateAccountDetails,
  updateUserCoverImage,
  getUserChannelProfile,
  getUserWatchedHistory,
};
