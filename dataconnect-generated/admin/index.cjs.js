const { validateAdminArgs } = require('firebase-admin/data-connect');

const connectorConfig = {
  connector: 'schoolhouse-admin',
  serviceId: 'school-house-service',
  location: 'europe-west4'
};
exports.connectorConfig = connectorConfig;

function getDeploymentStatus(dcOrOptions, options) {
  const { dc: dcInstance, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrOptions, options, undefined);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('GetDeploymentStatus', undefined, inputOpts);
}
exports.getDeploymentStatus = getDeploymentStatus;

function upsertDeploymentStatus(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('UpsertDeploymentStatus', inputVars, inputOpts);
}
exports.upsertDeploymentStatus = upsertDeploymentStatus;
