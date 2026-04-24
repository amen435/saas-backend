const { checkOwnership } = require('./ownership.middleware');

const ensureTeacherAssignedClass = checkOwnership({
  classIdSources: ['params.classId', 'body.classId', 'query.classId', 'query.class_id'],
});

module.exports = { ensureTeacherAssignedClass };
