import { verify } from "jsonwebtoken";
const createJWTServices = ({ publicKey })=>({
        verifyToken (token) {
            return new Promise((resolve)=>{
                verify(token, publicKey, {
                    algorithms: [
                        'RS256'
                    ]
                }, (err, decoded)=>err || !decoded ? resolve({
                        success: false,
                        error: err
                    }) : resolve({
                        success: true,
                        data: decoded
                    }));
            });
        }
    });
export { createJWTServices };
