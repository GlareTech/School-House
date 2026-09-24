const uniqueCourses=courses=>[...new Map(courses.map(course=>[`${course.classId}:${course.subjectId}`,course])).values()];

export function canTargetLibrary(scope,classId,subjectId){
  if(!scope)return true;
  if(classId&&!subjectId)return scope.classWideIds.includes(classId);
  if(subjectId&&!classId)return scope.courses.some(course=>course.subjectId===subjectId);
  if(classId&&subjectId)return scope.classWideIds.includes(classId)||scope.courses.some(course=>course.classId===classId&&course.subjectId===subjectId);
  return false;
}

export function libraryWhereForStaff(actorId,scope){
  const targets=[{uploadedById:actorId}],wide=[...new Set(scope.classWideIds)],courses=uniqueCourses(scope.courses);
  if(wide.length){
    targets.push({classId:{in:wide}});
    targets.push({AND:[{subjectId:{not:null}},{OR:[{classId:null},{classId:{in:wide}}]},{subject:{classSubjects:{some:{classId:{in:wide}}}}}]});
  }
  for(const course of courses)targets.push({subjectId:course.subjectId,OR:[{classId:null},{classId:course.classId}]});
  return {OR:targets};
}
