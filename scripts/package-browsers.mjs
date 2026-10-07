import {packageExtension} from './package-firefox.mjs';
for(const browser of ['firefox','chrome','edge'])await packageExtension(undefined,{browser});
console.log('Firefox, Chrome and Edge development extensions packaged.');
