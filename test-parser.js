#!/usr/bin/env node

/**
 * Test script to verify OpenSCAD customizer parser
 * Run: node test-parser.js
 */

const fs = require('fs');
const path = require('path');

// Read the built library
const rosLib = require('./dist/ros.js');

// Read test model
const testModelPath = path.join(__dirname, 'web', 'test-model.scad');
const testContent = fs.readFileSync(testModelPath, 'utf-8');

console.log('%c╔════════════════════════════════════════╗', 'color: #00ffff');
console.log('%c║  OpenSCAD Customizer Parser Test       ║', 'color: #00ffff');
console.log('%c╚════════════════════════════════════════╝', 'color: #00ffff');
console.log('');

console.log('📁 Test file:', testModelPath);
console.log('📊 File size:', testContent.length, 'bytes');
console.log('');

try {
  const result = rosLib.parseOpenSCADCustomizer(testContent, 'test-model.scad');
  
  console.log('✅ Parse successful!');
  console.log('');
  console.log('📋 Variables parsed:', result.variables.length);
  console.log('');
  
  // Group by tab
  const byTab = {};
  result.variables.forEach(v => {
    if (!byTab[v.tab]) byTab[v.tab] = [];
    byTab[v.tab].push(v);
  });
  
  Object.entries(byTab).forEach(([tab, vars]) => {
    console.log(`\n🏷️  Tab: ${tab}`);
    console.log('─'.repeat(60));
    
    vars.forEach(v => {
      console.log(`  ${v.name}`);
      console.log(`    • Type: ${v.valueType}`);
      console.log(`    • Widget: ${v.widget}`);
      console.log(`    • Default: ${JSON.stringify(v.defaultValue)}`);
      if (v.description) {
        console.log(`    • Description: ${v.description}`);
      }
      if (v.range) {
        console.log(`    • Range: [${v.range.min}:${v.range.step}:${v.range.max}]`);
      }
      if (v.options && v.options.length > 0) {
        console.log(`    • Options: ${v.options.map(o => `${o.label || o.value}`).join(', ')}`);
      }
    });
  });
  
  console.log('\n');
  console.log('✨ Parser ready for babylon_ros viewer!');
  
} catch (error) {
  console.error('❌ Parse failed:', error.message);
  process.exit(1);
}
