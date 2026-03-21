// Debug script to analyze Longbridge US sell fee calculation
// User reported: 10.3 USD/share, 1500 shares sold
// Calculated: 7.65 total fees
// Actual: 12.32 total fees (Platform: 7.5, Audit: 0.07, Settlement: 4.5, Trading Activity: 0.25)

function debugLongbridgeUSFees() {
  const price = 10.3;
  const shares = 1500;
  const amount = price * shares; // 15450
  
  console.log('=== Debug Longbridge US Sell Fees ===');
  console.log(`Price: $${price}, Shares: ${shares}, Amount: $${amount}`);
  
  // Current calculation logic
  const platformFee = Math.min(Math.max(shares * 0.005, 1), amount * 0.0099);
  const auditTrailFee = Math.max(shares * 0.000046, 0.01);
  const settlementFee = Math.min(shares * 0.003, amount * 0.07);
  const tradingActivityFee = Math.min(Math.max(shares * 0.000166, 0.01), 8.3);
  
  console.log('=== Current Calculation ===');
  console.log(`Platform Fee: $${platformFee.toFixed(2)} (min(max(${shares} * 0.005, 1), ${amount} * 0.0099))`);
  console.log(`Audit Trail Fee: $${auditTrailFee.toFixed(2)} (max(${shares} * 0.000046, 0.01))`);
  console.log(`Settlement Fee: $${settlementFee.toFixed(2)} (min(${shares} * 0.003, ${amount} * 0.07))`);
  console.log(`Trading Activity Fee: $${tradingActivityFee.toFixed(2)} (min(max(${shares} * 0.000166, 0.01), 8.3))`);
  console.log(`Total: $${(platformFee + auditTrailFee + settlementFee + tradingActivityFee).toFixed(2)}`);
  
  console.log('=== Actual Fees Reported ===');
  console.log('Platform Fee: $7.50');
  console.log('Audit Trail Fee: $0.07');
  console.log('Settlement Fee: $4.50');
  console.log('Trading Activity Fee: $0.25');
  console.log('Total: $12.32');
  
  // Analysis of differences
  console.log('=== Analysis ===');
  console.log(`Platform Fee difference: ${(7.50 - platformFee).toFixed(2)}`);
  console.log(`Settlement Fee difference: ${(4.50 - settlementFee).toFixed(2)}`);
  
  // Check if platform fee should have different calculation
  console.log(`Platform fee calculation: min(max(7.5, 1), 152.955) = ${Math.min(Math.max(7.5, 1), 152.955)}`);
  console.log(`Actual platform fee suggests: 7.5 = ${shares} * X, so X = ${7.5 / shares}`);
  
  // Check settlement fee calculation
  console.log(`Settlement fee calculation: min(4.5, 1081.5) = ${Math.min(4.5, 1081.5)}`);
  console.log(`Settlement fee actual: 4.5 = ${shares} * X, so X = ${4.5 / shares}`);
}

// Run debug
debugLongbridgeUSFees();