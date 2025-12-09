const fs = require('fs');

try {
    const empData = JSON.parse(fs.readFileSync('employees_sample.json', 'utf8'));
    console.log('Employee Keys:', Object.keys(empData.data[0]));
    console.log('Employee Sample:', JSON.stringify(empData.data[0], null, 2));
} catch (e) {
    console.log('Error reading employees:', e.message);
}

try {
    const transData = JSON.parse(fs.readFileSync('transactions_sample.json', 'utf8'));
    console.log('Transaction Keys:', Object.keys(transData.data[0]));
    console.log('Transaction Sample:', JSON.stringify(transData.data[0], null, 2));
} catch (e) {
    console.log('Error reading transactions:', e.message);
}
