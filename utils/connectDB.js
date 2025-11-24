import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("DB connected");
    } catch (error) {
        console.log("MongoDB connection error");
        process.exit();
    }
}

export {connectDB}