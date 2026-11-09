// Imports the full GeoNames India dataset into `locations`.
// 1. Download https://download.geonames.org/export/dump/IN.zip
// 2. Extract IN.txt into database/data/IN.txt
// 3. npm run db:locations
//
// Keeps populated places with population >= 1000 plus passes, peaks and lakes
// (so riding destinations like Khardung La are available). Skips rows that
// duplicate a curated starter location (same name within 5 km).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mysql = require('mysql2/promise');
const { haversineKm } = require('../server/utils/geo');

// GeoNames admin1 codes for India -> state names
const STATES = {
  '01': 'Andaman and Nicobar Islands', '02': 'Andhra Pradesh', '03': 'Assam', '05': 'Chandigarh',
  '07': 'Delhi', '09': 'Gujarat', '10': 'Haryana', '11': 'Himachal Pradesh', '12': 'Jammu and Kashmir',
  '13': 'Kerala', '14': 'Lakshadweep', '16': 'Maharashtra', '17': 'Manipur', '18': 'Meghalaya',
  '19': 'Karnataka', '20': 'Nagaland', '21': 'Odisha', '22': 'Puducherry', '23': 'Punjab',
  '24': 'Rajasthan', '25': 'Tamil Nadu', '26': 'Tripura', '28': 'West Bengal', '29': 'Sikkim',
  '30': 'Arunachal Pradesh', '31': 'Mizoram', '33': 'Goa', '34': 'Bihar', '35': 'Madhya Pradesh',
  '36': 'Uttar Pradesh', '37': 'Chhattisgarh', '38': 'Jharkhand', '39': 'Uttarakhand',
  '40': 'Telangana', '41': 'Ladakh', '52': 'Dadra and Nagar Haveli and Daman and Diu',
};

function kindFor(featureClass, featureCode, population) {
  if (featureClass === 'P') return population >= 100000 ? 'city' : population >= 5000 ? 'town' : 'village';
  if (featureCode === 'PASS') return 'pass';
  if (['PK', 'MT', 'PKS'].includes(featureCode)) return 'peak';
  if (['LK', 'LKS'].includes(featureCode)) return 'lake';
  return null;
}

async function main() {
  const file = path.join(__dirname, 'data', 'IN.txt');
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. See instructions at the top of this script.`);

  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [existing] = await db.query('SELECT name, lat, lng FROM locations');
  const isDuplicate = (name, lat, lng) =>
    existing.some((e) => e.name.toLowerCase().startsWith(name.toLowerCase()) &&
      haversineKm(Number(e.lat), Number(e.lng), lat, lng) < 5);

  const rl = readline.createInterface({ input: fs.createReadStream(file) });
  let batch = [];
  let total = 0;
  const flush = async () => {
    if (!batch.length) return;
    await db.query('INSERT IGNORE INTO locations (id, name, state, lat, lng, kind, population) VALUES ?', [batch]);
    total += batch.length;
    batch = [];
  };

  for await (const line of rl) {
    const c = line.split('\t');
    const [id, name, , , lat, lng, fClass, fCode, country, , admin1, , , , pop] = c;
    if (country !== 'IN') continue;
    const population = Number(pop) || 0;
    const kind = kindFor(fClass, fCode, population);
    if (!kind) continue;
    if (fClass === 'P' && population < 1000) continue;
    const la = Number(lat), lo = Number(lng);
    if (isDuplicate(name, la, lo)) continue;
    batch.push([Number(id), name.slice(0, 160), STATES[admin1] || '', la, lo, kind, population]);
    if (batch.length >= 1000) await flush();
  }
  await flush();
  await db.end();
  console.log(`Imported ${total} locations.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
