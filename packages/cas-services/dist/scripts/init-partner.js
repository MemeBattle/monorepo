#!/usr/bin/env node
import { writeFileSync } from "fs";
import { createInterface } from "readline";
import chalk from "chalk";
import { rainbow } from "chalk-animation";
const CAS_BASE_URI = 'https://cas.mems.fun';
const DEFAULT_KEY_PATH = './key.pem';
const createCasRoutes = (casURI = CAS_BASE_URI)=>({
        createPartner: `${casURI}/partners`,
        loginRequest: `${casURI}/auth/login`,
        getPartnerKey: (partnerId)=>`${casURI}/partners/${partnerId}/key`
    });
const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});
const styles = {
    defaultString: chalk.underline.blue,
    endLine: chalk.underline.bold.yellow,
    helper: chalk.underline.gray,
    success: chalk.green.bold
};
function decorateObjectMethods(obj, decorator) {
    return Object.entries(obj).reduce((decoratedObject, [key, prop])=>({
            ...decoratedObject,
            [key]: decorator(prop)
        }), {});
}
const createQuestion = (questionText, defaultValue = '')=>new Promise((resolve)=>rl.question(questionText, (answer)=>{
            resolve(answer || defaultValue);
        }));
const checkNotEmptyString = (inputString, errorMessage = '')=>{
    if (!inputString.length && errorMessage) throw new Error(errorMessage);
    return inputString.length > 0;
};
const showLoader = (asyncFunc)=>async (...args)=>{
        const loader = rainbow('Wait CAS answer...');
        const answer = await asyncFunc(...args);
        loader.stop();
        return answer;
    };
const createRequests = (CAS_URI)=>{
    const CAS_ROUTES = createCasRoutes(CAS_URI);
    return {
        loginRequest: async (credentials)=>{
            const response = await fetch(CAS_ROUTES.loginRequest, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(credentials)
            });
            const answer = await response.json();
            return answer.data;
        },
        createPartner: async (userData, token)=>{
            const response = await fetch(CAS_ROUTES.createPartner, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: token
                },
                body: JSON.stringify(userData)
            });
            const answer = await response.json();
            return answer.data;
        },
        getKey: async (partnerId, token)=>{
            const response = await fetch(CAS_ROUTES.getPartnerKey(partnerId), {
                headers: {
                    Authorization: token
                }
            });
            return response.json();
        }
    };
};
const partnerSignUp = async (user, createPartner, token)=>{
    const partnerUsername = await createQuestion(`Partner username (${styles.defaultString(user.username)}): `, user.username);
    checkNotEmptyString(partnerUsername, 'Username must be not empty');
    const partnerEmail = await createQuestion(`Partner email (${styles.defaultString(user.email)}): `);
    checkNotEmptyString(partnerUsername, 'Partner email must be not empty');
    const partnerPassword = await createQuestion("Partner password: ");
    checkNotEmptyString(partnerUsername, 'Password must be not empty');
    const answer = await createPartner({
        email: partnerEmail,
        username: partnerUsername,
        password: partnerPassword
    }, token);
    return answer._id;
};
const initPartner = async ()=>{
    try {
        const CAS_URI = await createQuestion(`CAS uri (${styles.defaultString(CAS_BASE_URI)}): `, CAS_BASE_URI);
        const { loginRequest, createPartner, getKey } = decorateObjectMethods(createRequests(CAS_URI), showLoader);
        const username = await createQuestion("username: ");
        checkNotEmptyString(username, 'Username must be not empty');
        const password = await createQuestion('password: ');
        checkNotEmptyString(password, 'Password must be not empty');
        const { token, user } = await loginRequest({
            login: username,
            password
        });
        console.log(styles.success(`Hello, ${user.username}`));
        const partnerId = await createQuestion(`partnerId (${styles.helper('blank field to create new')}): `);
        const newPartnerId = partnerId || await partnerSignUp(user, createPartner, token);
        const key = await getKey(newPartnerId, token);
        console.log('key: ', key);
        const keyPath = await createQuestion(`Path to save a key (${styles.defaultString(DEFAULT_KEY_PATH)}): `, DEFAULT_KEY_PATH);
        writeFileSync(keyPath, key, {
            flag: 'w+'
        });
    } catch (e) {
        console.error(e);
    } finally{
        console.log(styles.endLine('Good luck :)') + '\n');
        rl.close();
    }
};
initPartner().catch((error)=>{
    console.error(error);
    process.exit(1);
});
