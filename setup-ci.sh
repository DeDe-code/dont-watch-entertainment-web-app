#!/bin/bash

# Entertainment Web App - CI/CD Setup Script
# This script sets up the CI/CD pipeline for the project

echo "🚀 Setting up CI/CD Pipeline..."
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js and npm first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "⚠️  Warning: Node.js version is $NODE_VERSION. Version 20 or higher is recommended."
fi

echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

echo "🪝 Setting up Git hooks with Husky..."
npm run prepare

if [ $? -ne 0 ]; then
    echo "⚠️  Husky setup failed. Trying manual setup..."
    npx husky install
fi

# Make hooks executable
if [ -f ".husky/pre-commit" ]; then
    chmod +x .husky/pre-commit
    echo "✅ Pre-commit hook configured"
fi

if [ -f ".husky/pre-push" ]; then
    chmod +x .husky/pre-push
    echo "✅ Pre-push hook configured"
fi

echo ""
echo "🗄️  Setting up Prisma..."
npx prisma generate

if [ $? -ne 0 ]; then
    echo "❌ Prisma client generation failed"
    exit 1
fi

echo "✅ Prisma client generated"
echo ""

echo "🔍 Running initial checks..."
echo ""

echo "1️⃣  Linting..."
npm run lint
LINT_RESULT=$?

echo ""
echo "2️⃣  Type checking..."
npm run typecheck
TYPE_RESULT=$?

echo ""
echo "3️⃣  Format checking..."
npm run format:check
FORMAT_RESULT=$?

echo ""
echo "4️⃣  Prisma schema validation..."
npx prisma validate
PRISMA_RESULT=$?

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Setup Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $LINT_RESULT -eq 0 ]; then
    echo "✅ Linting: PASSED"
else
    echo "❌ Linting: FAILED - Run 'npm run lint:fix' to fix"
fi

if [ $TYPE_RESULT -eq 0 ]; then
    echo "✅ Type checking: PASSED"
else
    echo "❌ Type checking: FAILED - Fix TypeScript errors"
fi

if [ $FORMAT_RESULT -eq 0 ]; then
    echo "✅ Formatting: PASSED"
else
    echo "❌ Formatting: FAILED - Run 'npm run format' to fix"
fi

if [ $PRISMA_RESULT -eq 0 ]; then
    echo "✅ Prisma schema: VALID"
else
    echo "❌ Prisma schema: INVALID - Check schema.prisma"
fi

echo ""

if [ $LINT_RESULT -eq 0 ] && [ $TYPE_RESULT -eq 0 ] && [ $FORMAT_RESULT -eq 0 ] && [ $PRISMA_RESULT -eq 0 ]; then
    echo "🎉 CI/CD pipeline setup complete! All checks passed."
    echo ""
    echo "📝 Next steps:"
    echo "   1. Review .github/workflows/ for CI/CD configurations"
    echo "   2. Read .github/CI_CD_GUIDE.md for detailed documentation"
    echo "   3. Make your first commit to test pre-commit hooks"
    echo "   4. Push to test pre-push hooks"
    echo ""
    echo "🔗 Useful commands:"
    echo "   npm run lint        - Run linter"
    echo "   npm run lint:fix    - Auto-fix lint issues"
    echo "   npm run format      - Format code"
    echo "   npm run typecheck   - Check TypeScript"
    echo "   npm run ci          - Run all CI checks locally"
    exit 0
else
    echo "⚠️  CI/CD pipeline setup complete, but some checks failed."
    echo "   Please fix the issues above before committing."
    exit 1
fi
