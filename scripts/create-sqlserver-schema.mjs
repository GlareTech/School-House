import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
let schema = readFileSync('backend/prisma/schema.prisma', 'utf8');
schema = schema.replace('provider = "postgresql"', 'provider = "sqlserver"').replace(/enum \w+ \{[^}]+\}\s*/g, '');
schema = schema.replace(/\b(Role|ExamStatus|AttemptStatus|AttendanceStatus)\b/g, 'String');
schema = schema.replace(/@default\((STUDENT|DRAFT|ACTIVE)\)/g, '@default("$1")');
schema = schema.split('\n').map(line => {
  if (line.includes('@relation(')) {
    line = line.replace(/, onDelete: \w+/g, '').replace(/\]\)/g, '], onDelete: NoAction, onUpdate: NoAction)');
  }
  if (/^\s+\w+\s+Json\b/.test(line)) return line.replace(/\bJson\b/, 'String') + ' @db.NVarChar(Max)';
  const field = line.match(/^\s+(\w+)\s+String\??\s*/)?.[1];
  if (field) {
    const mapped=({email:254,guardianEmail:254,destination:320,name:150,recipientName:150,title:200,code:20,employeeNumber:50,storageName:100,key:30,componentKey:30,reference:100,kind:64,category:64,reportType:32,label:100,recipientKind:16,channel:16,audienceType:16,recipientType:16,role:16,status:32,permission:64,currency:3,csrf:64,lastSaveId:36,leaseToken:64,providerMessageId:500})[field];
    const length = mapped || (/^(id|.*Id)$/.test(field) ? 64 : null);
    line += ` @db.NVarChar(${length || 'Max'})`;
  }
  return line;
}).join('\n');
mkdirSync('backend/prisma-sqlserver', { recursive: true });
writeFileSync('backend/prisma-sqlserver/schema.prisma', schema);
