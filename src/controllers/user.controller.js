import { asyncHandler } from '../utils/asyncHandler.js';
import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { use } from 'react';

const registerUser = asyncHandler(async (req,res) => {
    const { username, email, fullName, password }= req.body



    // Validation of  required fields
    
    if([fullName, email, username, password].some((field) => field?.trim()=== '') ) {
      throw new ApiError(400 ,"All fields are required")  
    } 
//         console.log(
//   [fullName, email, username, password].some((field) => field?.trim() === '')
// );

    const existedUser = await User.findOne({
        $or : [{username}, {email}]
    })
    if (existedUser) {
        throw new ApiError(400, "User already exists");
    }

    const avatarLocalFile = req.files?.avatar[0]?.path;
    const coverImageLocalFile = req.files?.coverImage[0]?.path;
    
    if(!avatarLocalFile){
        throw new ApiError(400, "Avatar is required");
    }

    const avatar = uploadOnCloudinary(avatarLocalFile)
    const coverImage = uploadOnCloudinary(coverImageLocalFile)

    if(!avatar) {
        throw new ApiError(500, "Failed to upload avatar");
    }

    const user = await User.create({
        username : username.toLowecase(),
        email,
        fullName,
        password,
        avator : avatar.url,
        coverImage: coverImage?.url || ""
    })

    const createdUser = User.findById(user._id).select(
        "-password -refreshToken"
        )

    if(!createdUser){
        throw new ApiError(500, "Failed to create user");
    }

    return res.status(201).json(
        new ApiResponse(201, createdUser, "User registered successfully")
    )

}) 
export { registerUser }
