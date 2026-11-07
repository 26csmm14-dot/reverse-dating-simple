// db.js - Simple MongoDB Atlas Database Service with In-Memory Fallback
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://26csmm14_db_user:btRXu57YKBaPR82i@cluster0.zhvganu.mongodb.net/reverse_dating_simple?retryWrites=true&w=majority';
const DB_NAME = 'reverse_dating_simple';
const COLLECTION_NAME = 'applicants';

let client = null;
let db = null;
let collection = null;
let isConnected = false;

// In-memory fallback in case of connection failure or offline testing
const memoryStore = [];

async function connectDB() {
  if (isConnected && collection) return collection;

  try {
    console.log('[Database] Connecting to MongoDB Atlas...');
    client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });

    await client.connect();
    db = client.db(DB_NAME);
    collection = db.collection(COLLECTION_NAME);
    isConnected = true;
    console.log('[Database] Connected to MongoDB Atlas successfully!');
    return collection;
  } catch (err) {
    console.warn('[Database] Atlas connection failed. Using in-memory fallback store:', err.message);
    isConnected = false;
    return null;
  }
}

// Create a new applicant record
async function createApplicant(data) {
  const applicant = {
    name: (data.name || 'Anonymous').trim(),
    contactType: data.contactType || 'instagram',
    contact: (data.contact || '').trim().toLowerCase(),
    photo: data.photo || 'default-avatar',
    expectations: data.expectations || 'Skipped — Open to exploring the vibe organically',
    status: 'viewing',
    pitch: data.pitch || '',
    firstDateIdea: data.firstDateIdea || '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (isConnected && collection) {
    try {
      const result = await collection.insertOne(applicant);
      applicant._id = result.insertedId;
      applicant.id = result.insertedId.toString();
      return applicant;
    } catch (err) {
      console.warn('[Database] insertOne error, writing to memory store:', err.message);
    }
  }

  // Fallback to memory store
  applicant.id = 'cand_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  applicant._id = applicant.id;
  memoryStore.push(applicant);
  return applicant;
}

// Find applicant by ID (ObjectId or string)
async function findApplicantById(id) {
  if (!id) return null;
  const cleanId = String(id).trim();

  if (isConnected && collection) {
    try {
      let doc = null;
      if (cleanId.length === 24 && /^[0-9a-fA-F]{24}$/.test(cleanId)) {
        doc = await collection.findOne({ _id: new ObjectId(cleanId) });
      }
      if (!doc) {
        doc = await collection.findOne({
          $or: [{ _id: cleanId }, { id: cleanId }],
        });
      }
      if (doc) {
        doc.id = (doc._id || doc.id).toString();
        return doc;
      }
    } catch (err) {
      console.warn('[Database] findById error:', err.message);
    }
  }

  // Memory store search
  const found = memoryStore.find((a) => a.id === cleanId || a._id === cleanId);
  return found || null;
}

// Find applicant by contact handle
async function findApplicantByContact(contact) {
  if (!contact) return null;
  const cleanContact = String(contact).trim().toLowerCase();

  if (isConnected && collection) {
    try {
      const doc = await collection.findOne({ contact: cleanContact });
      if (doc) {
        doc.id = (doc._id || doc.id).toString();
        return doc;
      }
    } catch (err) {
      console.warn('[Database] findByContact error:', err.message);
    }
  }

  const found = memoryStore.find((a) => a.contact === cleanContact);
  return found || null;
}

// Update applicant by ID or contact
async function updateApplicant(id, updates) {
  if (!id) return null;
  const cleanId = String(id).trim();
  const updateData = { ...updates, updatedAt: new Date() };

  if (isConnected && collection) {
    try {
      let filter = { $or: [{ _id: cleanId }, { id: cleanId }, { contact: cleanId.toLowerCase() }] };
      if (cleanId.length === 24 && /^[0-9a-fA-F]{24}$/.test(cleanId)) {
        filter = { $or: [{ _id: new ObjectId(cleanId) }, { id: cleanId }] };
      }

      await collection.updateOne(filter, { $set: updateData });
      return await findApplicantById(cleanId);
    } catch (err) {
      console.warn('[Database] update error:', err.message);
    }
  }

  // Memory store update
  const index = memoryStore.findIndex(
    (a) => a.id === cleanId || a._id === cleanId || a.contact === cleanId.toLowerCase()
  );
  if (index !== -1) {
    memoryStore[index] = { ...memoryStore[index], ...updateData };
    return memoryStore[index];
  }

  return null;
}

// List all applicants
async function listApplicants() {
  if (isConnected && collection) {
    try {
      const docs = await collection.find({}).sort({ createdAt: -1 }).toArray();
      return docs.map((d) => ({ ...d, id: (d._id || d.id).toString() }));
    } catch (err) {
      console.warn('[Database] list error:', err.message);
    }
  }
  return [...memoryStore];
}

module.exports = {
  connectDB,
  createApplicant,
  findApplicantById,
  findApplicantByContact,
  updateApplicant,
  listApplicants,
};
