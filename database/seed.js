// Seeds starter locations, demo users, rides, trips and posts.
// Usage: npm run db:seed   (run after npm run db:schema)
require('dotenv').config();
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const locations = require('./data/starter-locations');

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  await db.query(
    'INSERT IGNORE INTO locations (id, name, state, lat, lng, kind, population) VALUES ?',
    [locations]
  );

  const hash = await bcrypt.hash('Rider@123', 12);
  const adminHash = await bcrypt.hash('Admin@123', 12);
  const users = [
    ['admin@bikersportal.in', adminHash, 'Portal Admin', 1, 'Royal Enfield Himalayan', 'Keeping the roads friendly.', 'admin'],
    ['arjun@example.com', hash, 'Arjun Rao', 1, 'KTM 390 Adventure', 'Weekend explorer, Western Ghats addict.', 'rider'],
    ['meera@example.com', hash, 'Meera Iyer', 6, 'Royal Enfield Classic 350', 'Sunrise rides and filter coffee.', 'rider'],
    ['kabir@example.com', hash, 'Kabir Singh', 27, 'BMW G 310 GS', 'Chasing high passes every summer.', 'rider'],
    ['zoya@example.com', hash, 'Zoya Khan', 19, 'Triumph Speed 400', 'Ghat roads and monsoon rides.', 'rider'],
    ['dev@example.com', hash, 'Dev Menon', 7, 'Honda CB350', 'Slow travel, long roads.', 'rider'],
  ];
  const [userRes] = await db.query(
    'INSERT INTO users (email, password_hash, display_name, home_location_id, bike_model, bio, role) VALUES ?',
    [users]
  );
  const uid = (i) => userRes.insertId + i; // 0 = admin, 1 = Arjun ...

  async function ride(hostIdx, title, description, stops, capacity, expense, status = 'published', tentative = false) {
    const [r] = await db.query(
      `INSERT INTO rides (host_id, title, description, start_location_id, end_location_id,
        start_date, end_date, is_tentative, capacity, expense_type, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [uid(hostIdx), title, description, stops[0][0], stops.at(-1)[0],
        stops[0][1], stops.at(-1)[1], tentative, capacity, expense, status]
    );
    const stopIds = [];
    for (let i = 0; i < stops.length; i++) {
      const [s] = await db.query(
        'INSERT INTO ride_stops (ride_id, location_id, stop_order, planned_date) VALUES (?,?,?,?)',
        [r.insertId, stops[i][0], i, stops[i][1]]
      );
      stopIds.push(s.insertId);
    }
    return { id: r.insertId, stopIds, stops };
  }

  const r1 = await ride(1, 'Nilgiris Weekend Loop', 'Bengaluru to Ooty via Mysuru and the Bandipur forest stretch. Easy pace, photo stops.',
    [[1, day(10)], [2, day(10)], [3, day(11)]], 8, 'shared');
  const r2 = await ride(3, 'Manali to Leh Expedition', 'Classic high-altitude run over Rohtang and Khardung La. Acclimatisation day in Leh.',
    [[27, day(30)], [29, day(31)], [31, day(32)], [35, day(35)], [36, day(37)]], 10, 'shared', 'published', true);
  const r3 = await ride(4, 'Konkan Coast Monsoon Ride', 'Pune down the ghats to Goa. Host covers fuel for the support vehicle.',
    [[19, day(15)], [21, day(15)], [15, day(17)]], 6, 'host_sponsored');
  const r4 = await ride(2, 'Hosur Sunrise Coffee Run', 'Short early-morning ride to Coorg estates.',
    [[6, day(-20)], [1, day(-20)], [4, day(-19)]], 5, 'shared', 'completed');

  const join = (ride, userIdx, from, to) =>
    db.query(
      `INSERT INTO ride_participants (ride_id, user_id, join_stop_id, leave_stop_id, join_date, leave_date)
       VALUES (?,?,?,?,?,?)`,
      [ride.id, uid(userIdx), ride.stopIds[from], ride.stopIds[to], ride.stops[from][1], ride.stops[to][1]]
    );
  await join(r1, 2, 0, 2);
  await join(r1, 5, 1, 2);
  await join(r2, 1, 2, 4);
  await join(r3, 1, 0, 2);
  await join(r4, 1, 0, 2);
  await join(r4, 5, 1, 2);

  await db.query('INSERT INTO reviews (ride_id, reviewer_id, rating, comment) VALUES ?', [[
    [r4.id, uid(1), 5, 'Perfect pace and great coffee stops.'],
  ]]);

  await db.query(
    'INSERT INTO trips (user_id, origin_location_id, destination_location_id, start_date, end_date, notes) VALUES ?',
    [[
      [uid(1), 1, 31, day(40), day(50), 'Looking for 1–2 riders for a relaxed Himachal trip.'],
      [uid(2), 6, 32, day(42), day(48), 'First time in the mountains, happy to share fuel and stays.'],
      [uid(5), 7, 31, day(45), day(55), 'Flexible on dates.'],
      [uid(4), 19, 15, day(20), day(23), 'Coastal road trip.'],
    ]]
  );

  await db.query('INSERT INTO posts (user_id, ride_id, body) VALUES ?', [[
    [uid(1), r4.id, 'Coorg at sunrise with the Hosur crew was unreal. Mist on every bend. Who is up for the next one?'],
    [uid(3), null, 'Tip for Ladakh first-timers: carry a spare clutch cable and take the acclimatisation day seriously.'],
    [uid(4), null, 'The Varandha ghat after the first rains is the greenest road in Maharashtra.'],
  ]]);

  await db.end();
  console.log('Seed complete. Admin: admin@bikersportal.in / Admin@123 · Riders: <name>@example.com / Rider@123');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
