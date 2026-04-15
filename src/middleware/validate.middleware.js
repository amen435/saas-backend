const { ZodError } = require('zod');

function formatZodIssues(issues = []) {
  return issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.validatedBody = schema.parse(req.body ?? {});
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next({
          statusCode: 400,
          message: 'Validation failed.',
          details: formatZodIssues(error.issues),
        });
      }
      return next(error);
    }
  };
}

function validateParams(schema) {
  return (req, res, next) => {
    try {
      req.validatedParams = schema.parse(req.params ?? {});
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next({
          statusCode: 400,
          message: 'Validation failed.',
          details: formatZodIssues(error.issues),
        });
      }
      return next(error);
    }
  };
}

module.exports = {
  validateBody,
  validateParams,
};
