import { asyncHandler } from '../utils/asyncHandler.js';
import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import jwt from 'jsonwebtoken';
import { upload } from '../middleware/multer.middleware.js';

const generateAccessAndRefreshToken = async(userId) => 
{
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()
        
        user.refreshToken = refreshToken
        await user.save({validateBeforeSave : false})

        return { accessToken, refreshToken }
        

    } 
    catch (error) {
        throw new ApiError(500, "Error generating tokens");
    }
}






const registerUser = asyncHandler(async (req,res) => {

      // get user details from frontend
    // validation - not empty
    // check if user already exists: username, email
    // check for images, check for avatar
    // upload them to cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return res

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
        throw new ApiError(409, "User already exists");
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar is required");
    }


    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar) {
        throw new ApiError(500, "Failed to upload avatar");
    }

    const user = await User.create({
        username: username.toLowerCase(),
        email,
        fullName,
        password,
        avatar : avatar.url,
        coverImage: coverImage?.url || ""
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
        )

    if(!createdUser){
        throw new ApiError(500, "Failed to create user");
    }

    return res.status(201).json(
        new ApiResponse(201, createdUser, "User registered successfully")
    )

}) 







const loginUser = asyncHandler(async(req,res) => {

    // req body -> data
    // username or email
    // find the user
    //password check
    //access and refresh token generation
    //send cookie

    const {email,username,password} = req.body

    if(!email && !username){
        throw new ApiError(400, "Email and username are required");
    }

    const user = await User.findOne({
        $or: [ {email}, {username} ]
    })

    if(!user){
        throw new ApiError(404, "User not found");
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid password");
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id) 

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true,
    }

    return res
    .status(201)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(201, 
            {user : loggedInUser, accessToken, refreshToken},
             "User logged in successfully")
    )
})





const logoutUser = asyncHandler(async (req, res) => {
    User.findByIdAndUpdate(
        req.user._id,
        { 
            $set: { refreshToken: undefined } 
        },
        {
            new: true
        },

    )
    const options = {
        httpOnly: true,
        secure: true
    }

    
    return res
    .status(200)
    .cookie("accessToken", "", options)
    .cookie("refreshToken", "", options)
    .json(new ApiResponse(200, null, "User logged out successfully"))
})  





const refereshToken = asyncHandler(async(req,res) => {
    const incomingRefereshToken = req.cookies.refereshToken || req.body.refereshToken
    
    if(!incomingRefereshToken){
        throw new ApiError(401, "No refresh token provided");
    }

   try {
     const decodedToken = jwt.verify(
         incomingRefereshToken,
         process.env.REFRESH_TOKEN_SECRET
     )
 
     const user = await User.findById(decodedToken._id)
 
     if(!user){
         throw new ApiError(404, "Invalid Refresh token");
     }
 
     if(incomingRefereshToken !== user?.refreshToken){
         throw new ApiError(401, "Refresh token expired or used");
     }
 
     const options = {
         httpOnly: true,
         secure: true
     }
     const {accessToken, newRefreshToken}= await generateAccessAndRefreshToken(user._id)
 
     return res
     .status(200)
     .cookie("accessToken",accessToken, options)
     .cookie("refreshToken", newRefreshToken, options)
     .json(new ApiResponse(200, {accessToken, refreshToken:newRefreshToken},"Tokens refreshed successfully"))
   } 
   
   catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
   } 


})





const changeCurrentPassword = asyncHandler(async(req,res) => {

    const {oldPassword, newPassword} = req.body

    const user = await User.findById(req.user?.id)

    const PasswordValid = await user.isPasswordCorrect(oldPassword)

    if(!PasswordValid){
        throw new ApiError(401, "Old password is incorrect");
    }

    user.password = newPassword
    await user.save({validateBeforeSave: true})
    
    return res
    .status(200)
    .json(new ApiResponse(200, null, "Password changed successfully"))
})



const getCurrentUser = asyncHandler(async(req,res) => {
    return res
    .status(200)
    .json(new ApiResponse(200, user, "User fetched successfully"))
})





const updateAccountDetails = asyncHandler(async(req,res) => {

    const {fullName, email} = req.body

    if(!fullName || !email){
        throw new ApiError(400,"all fields are required");
    }

    User.findByIdAndUpdate(
        req.user?.id,
        {
            $set: 
            {
                fullName, 
                email: email,
            },
            
        },
        {
                new: true,
        }
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"))
})





const updateUserAvatar = asyncHandler(async(req,res) => {
    const avatarLocalFile = req.file?.path
    if(!avatarLocalFile){
        throw new ApiError(400, "Avatar file is required");
    }

    const avatar = await uploadOnCloudinary(avatarLocalFile)
    if(!avatar.url){
        throw new ApiError(500, "Error while uploading avatar");
    } 

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: { avatar: avatar.url }
        },
        {
            new: true
        }
    ).select("-password -refereshToken")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar updated successfully"))
})




const updateUserCoverImage = asyncHandler(async(req,res) => {
    const coverImageLocalFile = req.file?.path
    if(!coverImageLocalFile){
        throw new ApiError(400, "CoverImage file is required");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalFile)
    if(!coverImage.url){
        throw new ApiError(500, "Error while uploading coverImage");
    } 

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: { coverImage: coverImage.url }
        },
        {
            new: true
        }
    ).select("-password -refereshToken")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "CoverImage updated successfully"))
})



export { 
    registerUser, 
    loginUser, 
    logoutUser, 
    refereshToken, 
    changeCurrentPassword, 
    getCurrentUser, 
    updateAccountDetails, 
    updateUserAvatar, 
    updateUserCoverImage,
    
    };
