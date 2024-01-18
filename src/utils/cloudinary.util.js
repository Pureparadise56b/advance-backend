import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadCloudinary = async (filePath) => {
  try {
    if (!filePath) return null;

    // upload file on cloudinary
    const response = await cloudinary.uploader.upload(filePath, {
      resource_type: "auto",
    });

    // file has been uploaded successfully
    console.log("File Uploaded On Cloudinary", response.url);
    return response;
  } catch (error) {
    // remove locally temp file as the upload operation got failed
    fs.unlinkSync(filePath);
    return null;
  }
};

export { uploadCloudinary };
