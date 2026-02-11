#!/bin/bash

# Security Testing Script for Zynk Platform
# Run this before deployment to check for vulnerabilities

echo "🔒 Starting Security Tests..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
FAILED=0
PASSED=0

# Base URL
BASE_URL="${BASE_URL:-http://localhost:4000}"

echo "Testing against: $BASE_URL"
echo ""

# Test 1: SQL Injection in Search
echo "📋 Test 1: SQL Injection Prevention"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/messages/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "'\'' OR '\''1'\''='\''1"}')

if echo "$RESPONSE" | grep -q "error\|validation\|Invalid"; then
  echo -e "${GREEN}✓ PASSED${NC} - SQL injection prevented"
  ((PASSED++))
else
  echo -e "${RED}✗ FAILED${NC} - SQL injection may be possible"
  ((FAILED++))
fi

# Test 2: XSS in Message Content
echo "📋 Test 2: XSS Prevention"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "<script>alert(\"XSS\")</script>", "email": "test@test.com", "password": "Test123456"}')

if echo "$RESPONSE" | grep -q "<script>" ; then
  echo -e "${RED}✗ FAILED${NC} - XSS payload not sanitized"
  ((FAILED++))
else
  echo -e "${GREEN}✓ PASSED${NC} - XSS prevented"
  ((PASSED++))
fi

# Test 3: Brute Force Protection
echo "📋 Test 3: Brute Force Protection"
for i in {1..6}; do
  curl -s -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email": "test@test.com", "password": "wrong'$i'"}' > /dev/null
done

RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@test.com", "password": "wrong7"}')

if echo "$RESPONSE" | grep -q "Too many\|rate limit\|429"; then
  echo -e "${GREEN}✓ PASSED${NC} - Rate limiting active"
  ((PASSED++))
else
  echo -e "${RED}✗ FAILED${NC} - No rate limiting detected"
  ((FAILED++))
fi

# Test 4: Path Traversal
echo "📋 Test 4: Path Traversal Prevention"
RESPONSE=$(curl -s "$BASE_URL/api/v1/files/../../etc/passwd/download")

if echo "$RESPONSE" | grep -q "root:\|error\|not found"; then
  if echo "$RESPONSE" | grep -q "root:"; then
    echo -e "${RED}✗ FAILED${NC} - Path traversal possible"
    ((FAILED++))
  else
    echo -e "${GREEN}✓ PASSED${NC} - Path traversal prevented"
    ((PASSED++))
  fi
else
  echo -e "${GREEN}✓ PASSED${NC} - Path traversal prevented"
  ((PASSED++))
fi

# Test 5: Security Headers
echo "📋 Test 5: Security Headers"
HEADERS=$(curl -s -I "$BASE_URL/api/health")

if echo "$HEADERS" | grep -q "X-Frame-Options\|X-Content-Type-Options"; then
  echo -e "${GREEN}✓ PASSED${NC} - Security headers present"
  ((PASSED++))
else
  echo -e "${YELLOW}⚠ WARNING${NC} - Some security headers missing"
  ((FAILED++))
fi

# Test 6: Weak Password
echo "📋 Test 6: Password Strength Validation"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User", "email": "weak@test.com", "password": "123456"}')

if echo "$RESPONSE" | grep -q "weak\|invalid\|error\|too short"; then
  echo -e "${GREEN}✓ PASSED${NC} - Weak passwords rejected"
  ((PASSED++))
else
  echo -e "${RED}✗ FAILED${NC} - Weak passwords accepted"
  ((FAILED++))
fi

# Test 7: File Upload Size Limit
echo "📋 Test 7: File Upload Size Limit"
# Create a large file (200MB)
dd if=/dev/zero of=/tmp/large_file.bin bs=1M count=200 2>/dev/null

RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/files/upload" \
  -F "file=@/tmp/large_file.bin" \
  2>&1)

rm /tmp/large_file.bin

if echo "$RESPONSE" | grep -q "too large\|413\|file size"; then
  echo -e "${GREEN}✓ PASSED${NC} - File size limit enforced"
  ((PASSED++))
else
  echo -e "${RED}✗ FAILED${NC} - No file size limit"
  ((FAILED++))
fi

# Test 8: CORS Configuration
echo "📋 Test 8: CORS Configuration"
RESPONSE=$(curl -s -H "Origin: http://evil.com" -I "$BASE_URL/api/health")

if echo "$RESPONSE" | grep -q "Access-Control-Allow-Origin: http://evil.com"; then
  echo -e "${RED}✗ FAILED${NC} - CORS allows unauthorized origins"
  ((FAILED++))
else
  echo -e "${GREEN}✓ PASSED${NC} - CORS properly configured"
  ((PASSED++))
fi

# Test 9: NoSQL Injection
echo "📋 Test 9: NoSQL Injection Prevention"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": {"$gt": ""}, "password": {"$gt": ""}}')

if echo "$RESPONSE" | grep -q "Invalid\|error\|validation"; then
  echo -e "${GREEN}✓ PASSED${NC} - NoSQL injection prevented"
  ((PASSED++))
else
  echo -e "${RED}✗ FAILED${NC} - NoSQL injection possible"
  ((FAILED++))
fi

# Test 10: Content-Type Validation
echo "📋 Test 10: Content-Type Validation"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/messages" \
  -H "Content-Type: text/plain" \
  -d "invalid content type")

if echo "$RESPONSE" | grep -q "error\|invalid\|Unsupported Media Type"; then
  echo -e "${GREEN}✓ PASSED${NC} - Content-Type validated"
  ((PASSED++))
else
  echo -e "${YELLOW}⚠ WARNING${NC} - Content-Type not validated"
  ((FAILED++))
fi

# Summary
echo ""
echo "================================"
echo "Security Test Summary"
echo "================================"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All security tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some security tests failed. Review and fix before deployment.${NC}"
  exit 1
fi
