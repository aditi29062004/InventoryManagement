const { sequelize } = require('../models');
sequelize.sync({ force: true })
  .then(() => {
    console.log('Database synced');
    process.exit(0);
  })
  .catch(err => {
    console.error('Sync failed:', err);
    process.exit(1);
  });
