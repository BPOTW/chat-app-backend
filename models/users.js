import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    username:{
        type:String,
        required:true,
        unique:true,
    },
    password:{
        type:String,
        required:true,
    },
    sessionid:{
        type:String,
    }
});

const User = mongoose.model('usersData',userSchema);

export default User;