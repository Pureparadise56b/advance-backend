import { asyncHandler } from "../utils/asyncHandler.util.js";
import ApiError from "../utils/ApiError.util.js";
import { User } from "../models/user.model.js";
import { uploadCloudinary } from "../utils/cloudinary.util.js";
import { ApiResponse } from "../utils/ApiResponse.util.js";

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

  // check if user already exist: email
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
  // console.log("AVATAR: ", avatar);

  // create user object - create entry in db
  const user = await User.create({
    fullname,
    username: username.toLowerCase(),
    email,
    password,
    avatar: avatar.secure_url,
    coverImage: coverImage?.secure_url || "",
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

export { registerUser };
