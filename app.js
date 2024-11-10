const express = require('express');
const mongoose = require('mongoose');
const creds = require("./creds")

const app = express();
const port = 3000;

app.use(express.json());

mongoose.connect(creds.db_url, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected...'))
.catch(err => console.error('Connection error', err));

const recordSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
  },
  category: {
    type: String,
    enum: [
      'vzp', 'plat', 'investice', 'polovicni_uvazek', 'bonus',

      'nakupovani', 'jidlo', 'telefon', 'zabava', 'vzdelani',
      'krasa', 'sport', 'socialni', 'doprava', 'obleceni', 'auto',
      'alkohol', 'cigarety', 'elektronika', 'cestovani', 'zdravi',
      'domaci_mazlicek', 'opravy', 'bydleni', 'domov', 'darky',
      'dary', 'loterie', 'svaciny', 'deti', 'zelenina', 'ovoce',

      'ostatni'
    ],
    default: "ostatni",
  },
  date: {
    type: Date,
    default: Date.now,
  },
  description: {
    type: String,
    maxlength: 500,
  },
});

const Record = mongoose.model('Record', recordSchema);

// API endpoints
app.post('/api/get_records', async (req, res) => {
  try {
    const query = { };

    if (req.body.start_date != undefined || req.body.end_date != undefined) {

      query.date = {};
      if (req.body.start_date != undefined) query.date.$gte = new Date(req.body.start_date);
      if (req.body.end_date != undefined) query.date.$lte = new Date(req.body.end_date);
    }

    const records = await Record.find(query).sort({ date: -1 });

    res.status(200).json(records);
  } catch (error) {
    console.error("Error fetching records:", error);
    throw error;
  }
});

app.post('/api/new_record', async (req, res) => {
  const record = new Record({
    amount: req.body.amount,
    category: req.body.category,
    date: req.body.date,
    description: req.body.description
  });

  try {
    const newRecord = await record.save();
    res.status(201).json(newRecord);
  } catch (err) {
    res.status(400);
  }
});

app.post('/api/edit_record', async (req, res) => {
  try {

    const updateData = {};
    if (req.body.amount !== undefined) updateData.amount = req.body.amount;
    if (req.body.category !== undefined) updateData.category = req.body.category;
    if (req.body.date !== undefined) updateData.date = new Date(req.body.date);
    if (req.body.description !== undefined) updateData.description = req.body.description;


    const updatedRecord = await Record.findByIdAndUpdate(
      req.body.id,
      { $set: updateData },
      { new: true }
    );

    res.status(201).json(updatedRecord);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.post('/api/delete_record', async (req, res) => {
  try {
    const deletedRecord = await Record.findByIdAndDelete(req.body.id);
    
    if (!deletedRecord) {
      res.status(400).json({ message: err.message });
      return;
    }

    res.json({ message: 'record deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/get_record_count_by_category', async (req, res) => {
  try {

    const start = req.body.start_date ? new Date(req.body.start_date) : null;
    const end = req.body.end_date ? new Date(req.body.end_date) : null;


    const matchFilter = {};
    if (start || end) {
      matchFilter.date = {};
      if (start) matchFilter.date.$gte = start;
      if (end) matchFilter.date.$lte = end;
    }


    const result = await Record.aggregate([
      { $match: matchFilter }, 
      {
        $group: {
          _id: {
            type: { $cond: { if: { $gte: ["$amount", 0] }, then: "income", else: "expense" } },
            category: "$category"
          },
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
      {
        $group: {
          _id: "$_id.type",
          categories: {
            $push: {
              category: "$_id.category",
              count: "$count",
              totalAmount: "$totalAmount",
            },
          },
        },
      },
      {
        $project: {
          type: "$_id",
          _id: 0,
          categories: 1,
        },
      },
    ]);

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching records:", error);
    throw error;
  }
});

app.post('/api/get_income', async (req, res) => {
  try {

    const start = req.body.start_date ? new Date(req.body.start_date) : null;
    const end = req.body.end_date ? new Date(req.body.end_date) : null;

    const matchFilter = {
      amount: { $gte: 0 },
    };
    
    if (start || end) {
      matchFilter.date = {};
      if (start) matchFilter.date.$gte = start;
      if (end) matchFilter.date.$lte = end;
    }


    const result = await Record.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalIncome: { $sum: "$amount" },
        },
      },
      {
        $project: {
          _id: 0,
          totalIncome: 1,
        },
      },
    ]);


    const total_income = result.length > 0 ? result[0].totalIncome : 0;

    res.status(200).json({total_income});
  } catch (error) {
    console.error("Error fetching records:", error);
    throw error;
  }
});

app.post('/api/get_expense', async (req, res) => {
  try {

    const start = req.body.start_date ? new Date(req.body.start_date) : null;
    const end = req.body.end_date ? new Date(req.body.end_date) : null;

    const matchFilter = {
      amount: { $lt: 0 },
    };
    
    if (start || end) {
      matchFilter.date = {};
      if (start) matchFilter.date.$gte = start;
      if (end) matchFilter.date.$lte = end;
    }

    const result = await Record.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalExpense: { $sum: "$amount" },
        },
      },
      {
        $project: {
          _id: 0,
          totalExpense: 1,
        },
      },
    ]);

    const total_expense = result.length > 0 ? result[0].totalExpense : 0;

    res.status(200).json({total_expense});
  } catch (error) {
    console.error("Error fetching records:", error);
    throw error;
  }
});

app.post('/api/get_balance', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    // Create a match filter object
    const matchFilter = {};
    if (start || end) {
      matchFilter.date = {};
      if (start) matchFilter.date.$gte = start;
      if (end) matchFilter.date.$lte = end;
    }

    const result = await Record.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalBalance: { $sum: "$amount" },
        },
      },
      {
        $project: {
          _id: 0,
          totalBalance: 1,
        },
      },
    ]);


    const total_balance = result.length > 0 ? result[0].totalBalance : 0;

    res.json({ total_balance });
  } catch (error) {
    console.error("Error fetching records:", error);
    throw error;
  }
});


app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
