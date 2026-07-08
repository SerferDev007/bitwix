// Creates the database + tables and seeds the services/team content.
// Usage: npm run db:init
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const DB_NAME = process.env.DB_NAME || 'bitwix';

const services = [
  {
    title: 'Website Development',
    description:
      'Create stunning, responsive websites that captivate your audience and drive business growth.',
    icon: 'Monitor',
    features: [
      'Responsive Design',
      'E-commerce Solutions',
      'Content Management Systems',
      'SEO Optimization',
      'Performance Optimization',
      'Custom Web Applications',
    ],
    sort_order: 1,
  },
  {
    title: 'Android App Development',
    description:
      'Build powerful Android applications that deliver exceptional user experiences and functionality.',
    icon: 'Smartphone',
    features: [
      'Native Android Apps',
      'Cross-Platform Solutions',
      'UI/UX Design',
      'API Integration',
      'App Store Deployment',
      'Maintenance & Support',
    ],
    sort_order: 2,
  },
];

const team = [
  {
    name: 'Sunil Hatkadke',
    role: 'Project Manager',
    description:
      'Experienced project manager with expertise in delivering complex technology projects on time and within budget. Specializes in client communication and project coordination.',
    image_url:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face',
    skills: ['Project Management', 'Client Relations', 'Agile Methodology', 'Team Leadership'],
    phone: '+91-8261861224',
    email: 'support@bitwix.co.in',
    sort_order: 1,
  },
  {
    name: 'Surekha Misal',
    role: 'HR Executive',
    description:
      'Dedicated HR professional focused on building strong teams and maintaining excellent workplace culture. Handles recruitment, employee relations, and organizational development.',
    image_url:
      'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=400&h=400&fit=crop&crop=face',
    skills: ['Human Resources', 'Recruitment', 'Employee Relations', 'Training & Development'],
    phone: '+91-8261861224',
    email: 'support@bitwix.co.in',
    sort_order: 2,
  },
];

async function main() {
  // Connect WITHOUT a database first so we can create it.
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  console.log(`Creating database "${DB_NAME}" (if it does not exist)...`);
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  );
  await conn.changeUser({ database: DB_NAME });

  console.log('Creating tables...');
  await conn.query(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name        VARCHAR(120)  NOT NULL,
      email       VARCHAR(180)  NOT NULL,
      phone       VARCHAR(40)   NULL,
      subject     VARCHAR(200)  NULL,
      message     TEXT          NOT NULL,
      status      ENUM('new','read','archived') NOT NULL DEFAULT 'new',
      ip_address  VARCHAR(45)   NULL,
      created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_contact_created_at (created_at),
      INDEX idx_contact_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS services (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      title       VARCHAR(150) NOT NULL,
      description TEXT         NOT NULL,
      icon        VARCHAR(60)  NULL,
      features    JSON         NULL,
      sort_order  INT          NOT NULL DEFAULT 0,
      is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS team_members (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name        VARCHAR(120) NOT NULL,
      role        VARCHAR(120) NOT NULL,
      description TEXT         NULL,
      image_url   VARCHAR(500) NULL,
      skills      JSON         NULL,
      phone       VARCHAR(40)  NULL,
      email       VARCHAR(180) NULL,
      sort_order  INT          NOT NULL DEFAULT 0,
      is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Seed services/team only if the tables are empty (idempotent).
  const [[svcCount]] = await conn.query('SELECT COUNT(*) AS c FROM services;');
  if (svcCount.c === 0) {
    console.log('Seeding services...');
    for (const s of services) {
      await conn.query(
        'INSERT INTO services (title, description, icon, features, sort_order) VALUES (?, ?, ?, ?, ?)',
        [s.title, s.description, s.icon, JSON.stringify(s.features), s.sort_order]
      );
    }
  }

  const [[teamCount]] = await conn.query('SELECT COUNT(*) AS c FROM team_members;');
  if (teamCount.c === 0) {
    console.log('Seeding team members...');
    for (const m of team) {
      await conn.query(
        'INSERT INTO team_members (name, role, description, image_url, skills, phone, email, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [m.name, m.role, m.description, m.image_url, JSON.stringify(m.skills), m.phone, m.email, m.sort_order]
      );
    }
  }

  await conn.end();
  console.log('\n✅ Database initialized successfully.');
}

main().catch((err) => {
  console.error('\n❌ Database initialization failed:', err.message);
  process.exit(1);
});
