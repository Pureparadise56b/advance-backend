// require("dotenv").config({ path: "./env" });

import dotenv from "dotenv";
import connectDB from "./db/index.db.js";

dotenv.config({ path: "./env" });

connectDB();

// this method is not professional

/* 
import express from "express";
const app = express();

(async () => {
  try {
    await mongoose.connect(`${process.env.MONGO_URL}/${DB_Name}`);
    app.on("error", (error) => {
      console.log("App can't connect with MONGODB");
      throw error;
    });

    app.listen(process.env.PORT, () => {
      console.log(`Server started at: http://localhost:/${process.env.PORT}`);
    });
  } catch (error) {
    console.log("ERROR: ", error);
  }
})();

*/
