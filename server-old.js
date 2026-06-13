require('dotenv').config(); const express = 
require('express'); const mongoose = 
require('mongoose'); const cors = require('cors'); 
const path = require('path'); const app = 
express(); const PORT = process.env.PORT || 3000; 
/* ======================================== 
MIDDLEWARE ======================================== 
*/ app.use(cors()); app.use(express.json()); 
app.use(express.static(
    path.join(__dirname,'public') )); /* 
======================================== MONGODB 
======================================== */ 
mongoose.connect(
    process.env.MONGO_URI ) .then(()=>{ 
    console.log(
        '✅ MongoDB Connected' );
})
.catch(err=>{ console.log( '❌ Mongo Error:', 
        err.message
    );
});
/* ======================================== ROUTES 
======================================== */ 
app.use(
    '/api/auth', require('./routes/auth') ); /* 
======================================== TEST 
======================================== */ 
app.get('/api/test',(req,res)=>{
    res.json({ status:'ArbiMine API Live'
    });
});
/* ======================================== 
FRONTEND ======================================== 
*/ app.get('*',(req,res)=>{
    res.sendFile( path.join( __dirname, 'public', 
            'index.html'
        ) );
});
/* ======================================== START 
======================================== */ 
app.listen(PORT,()=>{
    console.log( `🚀 Running on ${PORT}` );
});

