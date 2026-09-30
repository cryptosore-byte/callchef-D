import {openDatabase,migrate} from '../src/db.js';
const db=await openDatabase();await migrate(db);await db.close();console.log('Migrations appliquées.');
