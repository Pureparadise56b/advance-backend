import mongoose from "mongoose";
import { DB_Name } from "../constants.js";

// while talking with database, errors may be occur, so it is better to use try catch block or use promises.

// database is always in another continent so it is better to use async await.

const connectDB = async () => {
  try {
    const mongoRes = await mongoose.connect(
      `${process.env.MONGO_URL}/${DB_Name}`
    );
    console.log(`\n MongoDB Connected...`);
    console.log(`Mongo Host: ${mongoRes.connection.host}`);
  } catch (error) {
    console.log("MONGO CONNECTION FAILED: ", error);
    process.exit(1);
  }
};

export default connectDB;
