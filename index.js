const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { query } = require("express");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.6fgntc0.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    const appointmentOptionCollection = client
      .db("docPortal")
      .collection("doctorsAppointments");
    const bookingsCollection = client.db("docPortal").collection("bookings");
    const userCollection = client.db("docPortal").collection("users");
    const docCollection = client.db("docPortal").collection("doctors");
    const paymentCollection = client.db("docPortal").collection("payments");


    // verifyAdmin after verifyjwt

    const verifyAdmin = (req, res, next) => {
      console.log('inside verify admin', req.decoded.email);
     next()
    }
    // use aggregate to query multiCollection date;

    app.get("/appointmentOptions", async (req, res) => {
      const date = req.query.date;
      console.log(date);
      const query = {};
      const cursor = appointmentOptionCollection.find(query);
      const options = await cursor.toArray();

      // get booking  provide date

      const bookingQuery = { appointmentDate: date };
      const alreadyBooked = await bookingsCollection
        .find(bookingQuery)
        .toArray();

      // code carefully

      options.forEach((option) => {
        const optionBooked = alreadyBooked.filter(
          (book) => book.treatment === option.name
        );
        const bookedSlots = optionBooked.map((book) => book.slot);
        const remainingSlots = option.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        option.slots = remainingSlots;
        console.log(option.name, bookedSlots, remainingSlots.length);
      });
      res.send(options);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      const query = {
        appointmentDate: booking.appointmentDate,
        email: booking.email,
        treatment: booking.treatment,
      };
      const alreadyBooked = await bookingsCollection.find(query).toArray();
      if (alreadyBooked.length) {
        const messge = `ypu already booked on ${booking.appointmentDate}`;
        return res.send({ acknowledged: false, messge });
      }
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.get("/bookings", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      console.log("token ps", req.headers.authorization);
      const query = { email: email };
      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
    });

    /// 2nd

    // app.get('/bookings', async(req, res) =>{
    //   const query = {}
    //   const result = await bookingsCollection.find(query).toArray();
    //   res.send(result)
    // })
    app.get('/bookings/:id', async(req, res) =>{
      const id = req.params.id;
      const query = {_id: ObjectId(id)}
      const booking = await bookingsCollection.findOne(query);
      res.send(booking)
    })
    app.get('/users', async(req, res) =>{
        const query = {};
        const users= await userCollection.find(query).toArray();
        res.send(users)
    })
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get('/users/admin/:email', async(req, res) => {
        const email = req.params.email;
        const query = {email}
        const user = await userCollection.findOne(query);
       res.send({isAdmin: user?.role === 'admin'});
    })

    app.patch('/users/admin/:id',verifyJWT, async (req, res) =>{
        const decodedEmail = req.decoded.email;
        const query = {email: decodedEmail};
        const user = await userCollection.findOne(query);

        if(user?.role !== 'admin'){
            return res.status(403).send({messge: 'forbidden access'})
        }
        const id = req.params.id;
        const filter = {_id: ObjectId(id)};
        const options = {upsert:true};
        const updateDoc = {
            $set: {
                role: 'admin'
            }
        }
        const result = await userCollection.updateOne(filter, updateDoc, options);
        res.send(result)

    });

    app.get('/users/admin/:id', async(req, res) =>{
      const id = id.params.id;
      const query = {_id: ObjectId(id)}
      const user = await userCollection.findOne(query);
      res.send({isAdmin: user?.role === 'admin'})
    })

    function verifyJWT(req, res, next) {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send("unauthorized access");
      }
      const token = authHeader.split(" ")[1];
      jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET,
        function (err, decoded) {
          if (err) {
            console.log(err)
            return res.status(403).send({ message: "forbidden access" });

          }
          req.decoded = decoded;
          next();
        }
      );
    }

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: "1d",
        });
        return res.send({ accessToken: token });
      }
      console.log(user);
      return res.status(403).send({ accessToken: "" });
    });

    app.get('/appointmentSpeciality', async(req, res) =>{
      const query = {}
      const result = await appointmentOptionCollection.find(query).project({name:1}).toArray();
      res.send(result);
    });

    app.post("/doctors", verifyJWT,  async (req, res) => {
      const doctor = req.body;
      const result = await docCollection.insertOne(doctor);
      res.send(result);
    });
    app.get('/doctors', verifyJWT, async(req, res) => {
      const query = {};
      const result = await docCollection.find(query).toArray();
      res.send(result)
    })
    app.delete("/doctors/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await docCollection.deleteOne(filter);
      res.send(result);
    });

// temporary updated adding price on every appointment

    // app.get('/addPrice', async(req, res)=>{
    //   const filter = {}
    //   const options = {upsert: true}
    //   const updateDoc = {
    //     $set: {
    //       price: 99
    //     }
    //   }
    //   const result = await appointmentOptionCollection.updateMany(filter, updateDoc, options)
    //   res.send(result)
    // })


    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      console.log(booking);
      const price = booking.price
      const amount = price * 100;

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        'payment_method_types': [
          'card'
        ]
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post('/payments', async (req, res) =>{
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      res.send(result);

    })
  } finally {
  }
}
run().catch(console.log);

app.get("/", (req, res) => {
  res.send("doctors portal running");
});

app.listen(port, () => console.log(`doctors portal running on ${port}`));
