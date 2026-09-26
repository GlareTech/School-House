import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {config} from './config.js';

const key=createHash('sha256').update(`schoolhouse-integrations:${config.INTEGRATION_ENCRYPTION_KEY||config.PLATFORM_ADMIN_PASSWORD||'local-development-only'}`).digest();
export function encryptSecret(value){if(!value)return '';const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]),tag=cipher.getAuthTag();return Buffer.concat([iv,tag,body]).toString('base64url');}
export function decryptSecret(value){if(!value)return '';const data=Buffer.from(value,'base64url'),iv=data.subarray(0,12),tag=data.subarray(12,28),body=data.subarray(28),decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8');}
