const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const router = express.Router();

const User = require('../models/User');

function hashPassword(password){

    return crypto
    .createHash('sha256')
    .update(password)
    .digest('hex');
}

/*
========================================
REGISTER
========================================
*/

router.post('/register', async(req,res)=>{

    try{

        const {
            username,
            email,
            mpesa,
            password
        } = req.body;

        if(
            !username ||
            !email ||
            !mpesa ||
            !password
        ){

            return res.status(400).json({
                error:'All fields required'
            });
        }

        const existingUser = await User.findOne({ 
            $or:[
                {username}, {email} ]
        });
        if(existingUser){ return 
            res.status(409).json({
                error: 'User already exists, try 
                login'
            });
        }
        const user = await User.create({ username, 
            email, mpesa, passwordHash: 
            hashPassword(password)
        });
        const token = jwt.sign({ id:user._id, 
            username:user.username
        },
        process.env.JWT_SECRET, { expiresIn:'30d'
        });
        res.json({ success:true, token, user:{ 
                username: user.username, email: 
                user.email, mpesa: user.mpesa, 
                plan: user.plan
            }
        });
    }catch(err){
        res.status(500).json({ error:err.message
        });
    }
});
/* ======================================== LOGIN 
======================================== */ 
router.post('/login', async(req,res)=>{
    try{ const { username, password
        } = req.body;
        const user = await User.findOne({ username
        });
        if(
            !user ||
            user.passwordHash !== 
            hashPassword(password)
        ){ return res.status(401).json({ error: 
                'Invalid credentials'
            });
        }
        const token = jwt.sign({ id:user._id, 
            username:user.username
        },
        process.env.JWT_SECRET, { expiresIn:'30d'
        });
        res.json({ success:true, token, user:{ 
                username: user.username, email: 
                user.email, mpesa: user.mpesa, 
                plan: user.plan
            }
        });
    }catch(err){
        res.status(500).json({ error:err.message
        });
    }
});
module.exports = router;
