require('dotenv').config();

const axios = require("axios");
const puppeteer = require('puppeteer');
const emailEndpoint = process.env.EMAIL_ENDPOINT;
const smsKey = process.env.SMS_KEY;
const appId = process.env.SMS_APPID // Dich vu khac chothuesimcode.com
const appCost = process.env.SMS_APPCOST;
let canContinue = true;

axios.defaults.baseURL = emailEndpoint;
axios.defaults.headers.common['Mailsac-Key'] = process.env.MAILSAC_KEY;

const sleep = (time) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, time)
  })
}

function randomEmailName(length) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz'.split('');

  if (! length) {
    length = Math.floor(Math.random() * chars.length);
  }

  let str = '';
  for (let i = 0; i < length; i++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return str;
}

const fetchEmailInboxLink = async (email, page) => {
  return new Promise(resolve => {
    const interval = setInterval(async () => {
      const resEmail = await axios.get(`/addresses/${email}/messages`);
      const {data} = resEmail;
      if(data.length > 0){
        clearInterval(interval);
        await page.goto(data[0].links[0]);
        resolve(true);
      }else{
        console.log("Đang chờ lấy link inbox email....")
      }
    }, 2000);
  })

}

const checkAccountBalance = async () => {
  const response = await axios.get(`https://chothuesimcode.com/api?act=account&apik=${smsKey}`);
  const {Result} = response.data;
  if(Result && Result.Balance >= appCost){
    console.log("Số dư tài khoản SMS:", Result.Balance);
    return true;
  }else if(Result && Result.Balance < appCost){
    console.log("Tài khoản SMS không còn đủ tiền");
    return false;
  } else{
    console.log("Không thể kết nối đến tài khoản SMS");
    return false;
  }
}

const generatePhoneNumber = async () => {
  const response = await axios.get(`https://chothuesimcode.com/api?act=number&apik=${smsKey}&appId=${appId}&prefix=088`);
  const {Result} = response.data;
  if(Result && Result.Number){
    console.log("Generate số ĐT", Result.Number);
    return {phone: Result.Number, id: Result.Id};
  }else{
    console.log("Không thể lấy phone number !!");
    return false;
  }
}

const getOTPCode = async (id,page) => {
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      const response = await axios.get(`https://chothuesimcode.com/api?act=code&apik=${smsKey}&id=${id}`);
      const {ResponseCode, Result} = response.data;
      const timeout = setTimeout(() => {
        if(ResponseCode !== 0){
          // Nếu hết timeout 10s vẫn chưa lấy đc OTP thì trả false luôn
          clearInterval(interval);
          clearTimeout(timeout);
          resolve(false);
        }
      }, [10000]);
      if(ResponseCode === 0){
        clearTimeout(timeout);
        clearInterval(interval);
        console.log("Mã OTP của bạn là: ", Result.Code);
        resolve(Result.Code);
      }
    }, 2000);

  })

}

const createAccount = async () => {
  if(!canContinue) return;
  const browser = await puppeteer.launch({headless: false});
  const page = await browser.newPage();
  await page.goto('https://www.oreka.vn/campaign/welcome?reference=4ec7588a-5167-4e28-a11d-96acbfe5fa2f');
  await page.waitForSelector("button.styles_joinBtn__JsSSP.Button_secondary__3P0Bv.Button_button--common__2L02v");
  await page.click("button.styles_joinBtn__JsSSP.Button_secondary__3P0Bv.Button_button--common__2L02v");
  await page.click(".flex.justify-between.my-12 > button.Button_secondary__3P0Bv.Button_button--common__2L02v:last-child");
  await page.waitForSelector('input[name="email"]');
  // Generate email
  const password = "123456a";
  const emailName = `${randomEmailName(8).toLowerCase()}@mailsac.com`;
  await page.type('input[name="email"]', emailName);
  await page.click("button.font-bold.w-full.Button_secondary__3P0Bv.Button_button--common__2L02v");
  await page.waitForSelector('input[type="password"]');
  await page.type('input[name="newPassword"]', password);
  await page.type('input[name="confirmNewPassword"]', password);
  await page.click(".relative.mb-20.inline-block.w-full button[type='submit']");
  await page.waitForSelector("input.text-center.border.border-black-400.rounded-lg.mr-4.Field_input_code__3sbAX");
  await fetchEmailInboxLink(emailName, page);
  await page.waitForSelector("button.styles_joinBtn__JsSSP.Button_secondary__3P0Bv.Button_button--common__2L02v");
  await page.click("button.styles_joinBtn__JsSSP.Button_secondary__3P0Bv.Button_button--common__2L02v");
  await page.waitForSelector("input[name='phone']");
  const isCanGetSMS = await checkAccountBalance();
  if(!isCanGetSMS) {
    canContinue = false;
    await browser.close();
    return;
  }

  const {phone:phoneNumber, id} = await generatePhoneNumber();
  if(!phoneNumber){
    await browser.close();
    return;
  }
  await page.type("input[name='phone']", `0${phoneNumber}`);
  await page.click("button.font-bold.w-full.Button_secondary__3P0Bv.Button_button--common__2L02v");
  const otp = await getOTPCode(id, page);
  if(!otp){
    await browser.close();
    return;
  }
  const otpStr = otp + "";
  for(let i = 0; i < otpStr.length; i++){
    await page.type(`input.text-center.border.border-black-400.rounded-lg.mr-4.mb-12.Field_input_code__3sbAX:nth-child(${i + 1})`, otpStr[i]);
  }
  await page.waitForSelector("button.font-bold.w-full.mb-12.Button_secondary__3P0Bv.Button_button--common__2L02v");
  await page.click("button.font-bold.w-full.mb-12.Button_secondary__3P0Bv.Button_button--common__2L02v");
  await page.waitForSelector(".mx-auto.styles_position_modal__1fjeV.styles_background__ZTri1");
  console.log(`Create ${emailName} success !`);
  await browser.close();
}

(async () => {
  while(canContinue) {
    try{
      await Promise.all([
        createAccount(),
      ]);
      await sleep(5000);
    }catch (e) {
      canContinue = false
    }
  }
})();
