const express = require('express');
const mongoose = require('mongoose');
const creds = require("./creds");
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors({
  origin: 'http://localhost:4200',  // App
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

mongoose.connect(creds.db_url, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected...'))
.catch(err => console.error('Connection error', err));

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  icon: {
    type: String,  // url, font awesome nebo neco
    required: false,
  },
  color: {
    type: String,  // napr hex "#ff5733"
    required: false,
  },
  type: {
    type: Number,
    required: true,
    enum: [0, 1],  // 0 for expense, 1 for income
  },
});

const Category = mongoose.model('Category', categorySchema);

const recordSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,  // Odkaz na kategorii
    ref: 'Category',
    required: true,
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

app.get('/api/get_categories', async (req, res) => {
  try {
    const categories = await Category.find();
    res.status(200).json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    throw error;
  }
});

app.post('/api/new_record', async (req, res) => {
  const { amount, categoryId, date, description } = req.body;

  const record = new Record({
    amount,
    category: categoryId,
    date,
    description,
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

app.post('/api/new_category', async (req, res) => {
  const { name, icon, color, type } = req.body;

  // Validate that type is either 0 or 1
  if (![0, 1].includes(type)) {
    return res.status(400).json({ message: "Invalid type. Must be 0 (expense) or 1 (income)." });
  }

  const category = new Category({
    name,
    icon,
    color,
    type,
  });

  try {
    const newCategory = await category.save();
    res.status(201).json(newCategory);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Edit a category
app.post('/api/edit_category', async (req, res) => {
  try {
    const { id, name, icon, color, type } = req.body;

    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (icon !== undefined) updateData.icon = icon;
    if (color !== undefined) updateData.color = color;
    if (type !== undefined) {
      if (![0, 1].includes(type)) {
        return res.status(400).json({ message: "Invalid type. Must be 0 (expense) or 1 (income)." });
      }
      updateData.type = type;
    }

    const updatedCategory = await Category.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.status(201).json(updatedCategory);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a category
app.post('/api/delete_category', async (req, res) => {
  try {
    const { id } = req.body;

    const deletedCategory = await Category.findByIdAndDelete(id);

    if (!deletedCategory) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Optionally, delete associated records or update them to have no category
    await Record.updateMany({ category: id }, { $unset: { category: "" } });

    res.status(200).json({ message: 'Category deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting category' });
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

    // Aggregation pipeline to get count and totalAmount grouped by category
    const result = await Record.aggregate([
      { $match: matchFilter },
      // Join with Category collection to get category details (like name)
      {
        $lookup: {
          from: 'categories',  // Collection name of the Category model
          localField: 'category',  // Foreign key in Record model
          foreignField: '_id',  // Primary key in Category model
          as: 'categoryDetails',  // Add the result of the join into this field
        },
      },
      // Flatten the categoryDetails array (since $lookup results in an array)
      { $unwind: { path: '$categoryDetails' } },
      // Determine the type (income or expense)
      {
        $addFields: {
          categoryType: {
            $cond: {
              if: { $gte: ["$amount", 0] },
              then: 1, // 1 for income
              else: 0,  // 0 for expense
            },
          },
        },
      },
      // Group by category type (income or expense) and category
      {
        $group: {
          _id: {
            type: "$categoryType",  // Use the categoryType field to group by income or expense
            category: "$categoryDetails._id",  // Use category _id for grouping
            categoryName: "$categoryDetails.name"  // Include category name
          },
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
      // Group by income/expense type and push category info into categories array
      {
        $group: {
          _id: "$_id.type",  // Group by income or expense
          categories: {
            $push: {
              categoryId: "$_id.category",  // The category _id
              categoryName: "$_id.categoryName",  // Category name
              type: "$_id.type",  // Type 0 for expense, 1 for income
              count: "$count",  // Number of records for this category
              totalAmount: "$totalAmount",  // Sum of amounts for this category
            },
          },
        },
      },
      // Format the result
      {
        $project: {
          type: "$_id",  // Project the income/expense type
          _id: 0,  // Exclude the _id field from the output
          categories: 1,  // Include the categories array
        },
      },
    ]);

    // Respond with the result
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching records:", error);
    res.status(500).json({ message: error.message });
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

const seedCategories = async () => {
  const incomeCategories = [
    { name: 'vzp', type: 1 },
    { name: 'plat', type: 1 },
    { name: 'investice', type: 1 },
    { name: 'poloviční_úvazek', type: 1 },
    { name: 'bonus', type: 1 },
  ];

  const expenseCategories = [
    { name: 'nakupování', type: 0 },
    { name: 'jídlo', type: 0 },
    { name: 'telefon', type: 0 },
    { name: 'zábava', type: 0 },
    { name: 'vzdělání', type: 0 },
    { name: 'krása', type: 0 },
    { name: 'sport', type: 0 },
    { name: 'sociální', type: 0 },
    { name: 'doprava', type: 0 },
    { name: 'oblečení', type: 0 },
    { name: 'auto', type: 0 },
    { name: 'alkohol', type: 0 },
    { name: 'cigarety', type: 0 },
    { name: 'elektronika', type: 0 },
    { name: 'cestování', type: 0 },
    { name: 'zdraví', type: 0 },
    { name: 'domácí_mazlíček', type: 0 },
    { name: 'opravy', type: 0 },
    { name: 'bydlení', type: 0 },
    { name: 'domov', type: 0 },
    { name: 'dárky', type: 0 },
    { name: 'dary', type: 0 },
    { name: 'loterie', type: 0 },
    { name: 'svačiny', type: 0 },
    { name: 'děti', type: 0 },
    { name: 'zelenina', type: 0 },
    { name: 'ovoce', type: 0 },
    { name: 'ostatní', type: 0 },
  ];

  try {
    // Check if categories already exist, if not, create them
    for (const category of [...incomeCategories, ...expenseCategories]) {
      const existingCategory = await Category.findOne({ name: category.name });
      if (!existingCategory) {
        await Category.create(category);
        console.log(`Category ${category.name} created.`);
      }
    }
  } catch (error) {
    console.error("Error seeding categories:", error);
  }
};

// Call seed function when the server starts
mongoose.connection.once('open', () => {
  seedCategories();
});


app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
