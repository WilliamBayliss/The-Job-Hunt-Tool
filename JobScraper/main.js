import * as dotenv from "dotenv";
dotenv.config();
import puppeteer from "puppeteer";
import random from "lodash";
import { MongoClient } from "mongodb";

const wait = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms + random(0, ms * 2)));

async function pushJobsToDB(jobs, url=process.env.MONGO_URL) {
  // Set url and create mongoDB client
  const client = new MongoClient(url);
  try {
    // Connect to db
    console.log("Connecting to MongoDB...");
    await client.connect();
    console.log("Connected!");
    console.log("Inserting accounts...");

    const accounts = client.db("ScrapedJobs").collection("jobs");
    // Push all created account objects to the database
    await accounts.insertMany(jobs);
    console.log("Accounts added to database!");
  } catch (e) {
    console.error(e);
  } finally {
    client.close();
  }
}

async function scrapeJobs(page) {
  await page.goto(
    "https://www.linkedin.com/jobs/search/?currentJobId=3443861821&f_E=2&f_JT=F&geoId=101174742&keywords=%22junior%20react%20developer%22&location=Canada&refresh=true&sortBy=R"
  );
  console.log("1")
  // Get preliminary Job info from search results
  await page.waitForSelector(".scaffold-layout__list-container");
  console.log("Jobs Found");
  let jobList = await page.evaluate(() => {
    let jobs = [];
    let jobCards = Array.from(
      document.getElementsByClassName("jobs-search-results__list-item")
    );
    console.log(jobCards);
    for (let job of jobCards) {
      let jobLink = job.querySelector("a");
      let companyName = job.querySelector(".job-card-container__company-name");
      jobs.push({
        title: jobLink.innerText,
        company: companyName.innerText,
        link: jobLink.href,
      });
    }
    return jobs;
  });

  return jobList;
}

async function scrapeHiringManagers(page, job) {
  // Go to job posting
  await page.goto(job.link);
  // Look for hiring manager card and get name, profile link
  try {
    await page.waitForSelector(".hirer-card__container");
    let hiringManager = await page.evaluate(() => {
      let hiringCard = document.querySelector(".hirer-card__container");
      let hiringInfo = hiringCard.querySelector(
        ".hirer-card__hirer-information"
      );
      let hiringManagerAnchor = hiringInfo.querySelector("a");
      // Scrape hiring manager info
      let hiringManagerName = hiringManagerAnchor.innerText;
      let hiringManagerProfileLink = hiringManagerAnchor.href;
      return [hiringManagerName, hiringManagerProfileLink];
    });
    job.hiringManager = hiringManager[0];
    job.hiringManagerProfileLink = hiringManager[1];
    console.log(job.hiringManager, ", ", job.hiringManagerProfileLink);
  } catch (e) {
    job.hiringManager = "N/A"
    job.hiringManagerProfileLink = "N/A"
    console.log("Error scraping hiring manager:");
    console.log(e);
  }
  return;
}

async function main(
  username = process.env.LINKED_IN_USERNAME,
  password = process.env.LINKED_IN_PASSWORD
) {
  // Launch puppeteer
  const browser = await puppeteer.launch({
    headless: false,
  });

  //   Sign In & Goto Search
  const page = await browser.newPage();
  await page.goto("https://www.linkedin.com/login");
  await page.type("#username", username);
  await page.type("#password", password);
  await page.click("[type='submit']");
  await page.waitForNavigation();

  let jobsList = await scrapeJobs(page);
  console.log(jobsList);
  for (let job of jobsList) {
    await scrapeHiringManagers(page, job);
  }
  await browser.close();
  // Push jobs to db
  await pushJobsToDB(jobsList);
}

await main();