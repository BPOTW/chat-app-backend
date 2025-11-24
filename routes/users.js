import express from "express"
import {saveUser, checkUser} from "../controllers/users.js"

const router = express.Router();

router.post('/login',checkUser);
router.post('/signup',saveUser);


export default router;