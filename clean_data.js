const path = require('path');
const fs = require('fs');
const config = require('./server/config');
const db = require('./server/database');

async function cleanAll() {
  console.log('🧹 Cleaning Database and Local Cache Files...');

  try {
    const list = await db.listFiles({ limit: 500 });
    if (list.files && list.files.length > 0) {
      console.log(`Found ${list.files.length} active files. Cleaning...`);
      for (const f of list.files) {
        await db.hardDeleteFile(f.id);
      }
      console.log('✅ Cleaned all active files.');
    } else {
      console.log('✅ Database is already clean (0 files).');
    }
  } catch (err) {
    console.error('Clean error:', err.message);
  }

  // Ensure storage directories exist
  const uploadsDir = path.resolve('./storage/uploads');
  const tmpDir = path.resolve('./storage/uploads/.tmp');
  [uploadsDir, tmpDir].forEach(d => {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
    }
  });

  console.log('🚀 Clean Data & Reset Completed Successfully!');
  process.exit(0);
}

cleanAll();
