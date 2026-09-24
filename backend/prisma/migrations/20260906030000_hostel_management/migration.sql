ALTER TABLE "AppSetting" ADD COLUMN "hostelEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Hostel" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "genderPolicy" TEXT NOT NULL DEFAULT 'MIXED',
  "address" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Hostel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Hostel_name_key" ON "Hostel"("name");

CREATE TABLE "HostelRoom" (
  "id" TEXT NOT NULL,
  "hostelId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "floor" TEXT NOT NULL DEFAULT '',
  "capacity" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "HostelRoom_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HostelRoom_hostelId_name_key" ON "HostelRoom"("hostelId","name");
CREATE INDEX "HostelRoom_hostelId_idx" ON "HostelRoom"("hostelId");

CREATE TABLE "HostelBed" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "HostelBed_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HostelBed_roomId_label_key" ON "HostelBed"("roomId","label");
CREATE INDEX "HostelBed_roomId_idx" ON "HostelBed"("roomId");

CREATE TABLE "HostelAllocation" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "bedId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "notes" TEXT NOT NULL DEFAULT '',
  "allocatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HostelAllocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HostelAllocation_studentId_status_idx" ON "HostelAllocation"("studentId","status");
CREATE INDEX "HostelAllocation_bedId_status_idx" ON "HostelAllocation"("bedId","status");

ALTER TABLE "HostelRoom" ADD CONSTRAINT "HostelRoom_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "Hostel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HostelBed" ADD CONSTRAINT "HostelBed_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "HostelRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HostelAllocation" ADD CONSTRAINT "HostelAllocation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HostelAllocation" ADD CONSTRAINT "HostelAllocation_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "HostelBed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HostelAllocation" ADD CONSTRAINT "HostelAllocation_allocatedById_fkey" FOREIGN KEY ("allocatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;