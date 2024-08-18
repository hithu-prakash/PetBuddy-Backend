const Review = require('../models/review-model');
const Booking= require('../models/booking-model')
const CareTaker=require('../models/careTaker-model')
const Pet=require('../models/pet-model')
const Parent=require('../models/petParent-model')
const { validationResult } = require('express-validator');
const _ = require('lodash')
const nodemailer = require('nodemailer');
const {uploadToCloudinary } = require('../utility/cloudinary')

const reviewCltr = {};

// Create a new review
reviewCltr.create = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const bookingId = req.params.bookingId;
        const { ratings, description } = req.body;
        const userId = req.user.id;

        // Check if the user has already reviewed this booking
        const existingReview = await Review.findOne({ bookingId, userId });
        if (existingReview) {
            return res.status(403).json('You have already given a review for this booking');
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        const caretakerId = booking.caretakerId;
        const petId = booking.petId; // Ensure this field exists in Booking
        const petparentId = booking.petparentId; // Ensure this field exists in Booking

        // Calculate new average rating for the caretaker
        const noOfReviews = await Review.countDocuments({ caretakerId });
        const caretaker = await CareTaker.findById(caretakerId);
        if (!caretaker) {
            return res.status(404).json({ error: 'Caretaker not found' });
        }
        const prevRating = caretaker.rating || 0;
        const newRating = (prevRating * noOfReviews + ratings) / (noOfReviews + 1);
        caretaker.rating = newRating;

        // Save caretaker and review
        await caretaker.save();

        const review = new Review({
            userId,
            caretakerId,
            petId,
            petparentId,
            bookingId,
            ratings,
            description
        });

        if (req.file) {
            console.log('Photo file received:', req.file);

            const photoOptions = {
                folder: 'Pet-Buddy-PetParent/review',
                quality: 'auto',
            };

            // Upload photo to Cloudinary
            const photoResult = await uploadToCloudinary(req.file.buffer, photoOptions);
            console.log('Upload result:', photoResult);
            console.log('Uploaded photo URL:', photoResult.secure_url);

            // Assign the uploaded photo URL to the review
            review.photos = photoResult.secure_url;
        } else {
            console.log('No photo file received');
        }

        await review.save();

        // Update booking to indicate that a review has been made
        await Booking.findByIdAndUpdate(
            bookingId,
            { $set: { isReview: true } },
            { new: true }
        );

        res.status(201).json(review);
    } catch (err) {
        console.log('Error creating review:', err);
        res.status(500).json({ errors: "Internal server error" });
    }
};

// Retrieve all reviews
reviewCltr.getAll = async (req, res) => {
    try {
        const reviews = await Review.find()
            .populate('userId', 'username email')
            .populate('caretakerId', 'name')
            .populate('bookingId', 'startTime endTime')
            .sort({ rating: -1 });
        
        res.status(200).json(reviews);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ errors: 'Something went wrong' });
    }
};

// Retrieve reviews by caretaker ID
reviewCltr.getByCaretaker = async (req, res) => {
    const { caretakerId } = req.params;
    try {
        const reviews = await Review.find({ caretakerId })
            .populate('userId', 'username email')
            .populate('caretakerId', 'name')
            .populate('bookingId', 'startTime endTime');
        
        res.status(200).json(reviews);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ errors: 'Something went wrong' });
    }
};

// Update a review
reviewCltr.update = async (req, res) => {
    const { reviewId } = req.params;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const body = req.body;
        const review = await Review.findByIdAndUpdate(reviewId, body, { new: true })
            .populate('userId', 'username email')
            .populate('caretakerId', 'name')
            .populate('bookingId', 'startTime endTime');
        
        if (!review) {
            return res.status(404).json({ errors: 'Review not found' });
        }
        
        res.status(200).json(review);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ errors: 'Something went wrong' });
    }
};

// Delete a review
reviewCltr.delete = async (req, res) => {
    const { reviewId } = req.params;
    try {
        const review = await Review.findByIdAndDelete(reviewId)
            .populate('userId', 'username email')
            .populate('caretakerId', 'name')
            .populate('bookingId', 'startTime endTime');
        
        if (!review) {
            return res.status(404).json({ errors: 'Review not found' });
        }
        
        res.status(200).json({ message: 'Review deleted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ errors: 'Something went wrong' });
    }
};

module.exports = reviewCltr;
