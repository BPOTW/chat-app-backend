import User from "../models/users.js";
import bcrypt from "bcrypt";

const saveUser = async (req, res) => {
  try {
    const password = await bcrypt.hash(req.body.password, 10);
    const username = req.body.username;
    const sessionid = req.body.sessionid;

    const existing = await User.findOne({ username });

    if (existing) {
      res
        .status(200)
        .json({ message: "Username already exists", login: false });
      return;
    }

    const userData = await User({
      username: username,
      password: password,
      sessionid: sessionid,
    });
    await userData.save();

    res.status(200).json({
      username: userData.username,
      sessionid: userData.sessionid,
      login: true,
    });
  } catch (error) {
    res.status(500).json(error);
  }
};

const checkUser = async (req, res) => {
  try {
    const username = req.body.username;
    const password = req.body.password;

    const userData = await User.findOne({ username });

    if (!userData) {
      res.status(200).json({ message: "Incorrect username/password", login:false });
      return;
    }

    const hash = await bcrypt.compare(password, userData.password);

    if (!hash) {
      res.status(200).json({ message: "Incorrect username/password", login:false });
      return;
    }

    res.status(200).json({ login: true, userData });
  } catch (error) {
    console.log("Error occured", error);
    res.status(500).json(error);
  }
};

export { saveUser, checkUser };
