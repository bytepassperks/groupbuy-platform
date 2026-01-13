const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const isProduction = process.argv.includes('--production');

const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: isProduction,
  debugProtectionInterval: isProduction ? 4000 : 0,
  disableConsoleOutput: isProduction,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.75,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

const distDir = path.join(__dirname, 'dist');

// Create dist directory if it doesn't exist
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Files to obfuscate
const jsFiles = ['content.js', 'background.js', 'popup.js'];

// Obfuscate each JS file
jsFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const code = fs.readFileSync(filePath, 'utf8');
    
    console.log(`Obfuscating ${file}...`);
    
    const obfuscatedCode = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions);
    
    fs.writeFileSync(
      path.join(distDir, file),
      obfuscatedCode.getObfuscatedCode()
    );
    
    console.log(`  -> dist/${file} created`);
  }
});

// Copy non-JS files to dist
const filesToCopy = ['manifest.json', 'popup.html', 'icons'];

filesToCopy.forEach(file => {
  const srcPath = path.join(__dirname, file);
  const destPath = path.join(distDir, file);
  
  if (fs.existsSync(srcPath)) {
    if (fs.statSync(srcPath).isDirectory()) {
      // Copy directory recursively
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      fs.readdirSync(srcPath).forEach(subFile => {
        fs.copyFileSync(
          path.join(srcPath, subFile),
          path.join(destPath, subFile)
        );
      });
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
    console.log(`Copied ${file} to dist/`);
  }
});

console.log('\nBuild complete! Distribution files are in the dist/ folder.');
console.log(isProduction ? 'Production build (debug protection enabled)' : 'Development build');
