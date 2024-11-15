const fs = require("fs");
const { Parser } = require("json2csv");
const puppeteer = require("puppeteer");

// Helper function to pause execution for a given time
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Saves scraped product data to a CSV file
function saveProductsToCSV(products) {
  const fields = ["name", "price", "image", "link"];
  const parser = new Parser({ fields, quote: "" });
  const csv = parser.parse(products);
  fs.writeFileSync("products.csv", csv, "utf8");
  console.log("Data successfully saved to products.csv");
}

// Reads CSV and returns unique products with the highest prices
function getUniquePricedProducts(noOfProducts) {
  const csvData = fs.readFileSync("products.csv", "utf8");
  const products = csvData
    .split("\n")
    .slice(1)
    .map((line) => {
      const [name, price, image, link] = line
        .split(",")
        .map((item) => item.replace(/"/g, "").trim());
      return {
        name,
        price: parseFloat(price.replace(/[^0-9.-]+/g, "")),
        image,
        link,
      };
    });

  const uniquePrices = new Set();
  const uniqueProducts = [];

  products.forEach((product) => {
    if (!uniquePrices.has(product.price)) {
      uniquePrices.add(product.price);
      uniqueProducts.push(product);
    }
  });

  return uniqueProducts
    .sort((a, b) => b.price - a.price)
    .slice(0, noOfProducts);
}

// Scrapes additional product details from a product page
async function fetchProductDetails(browser, productLink) {
  const productPage = await browser.newPage();
  await productPage.goto(productLink, { waitUntil: "networkidle2" });

  const productDetails = await productPage.evaluate(() => {
    const title = document.querySelector(".product_title")?.innerText || "N/A";
    const price = document.querySelector(".price")?.innerText || "N/A";
    const description =
      document.querySelector(".woocommerce-product-details__short-description")
        ?.innerText || "N/A";
    const sku = document.querySelector(".sku_wrapper .sku")?.innerText || "N/A";
    const category = document.querySelector(".posted_in")?.innerText || "N/A";

    return { title, price, description, sku, category };
  });

  await productPage.close();
  return productDetails;
}

// Retrieves details for the top 5 unique, highest-priced products
async function getProductDetails(browser, products) {
  const productDetails = await Promise.all(
    products.map((product) => fetchProductDetails(browser, product.link))
  );

  return productDetails;
}

// Scrapes products from the targeted webpage
async function scrapeProductsFromPage(browser) {
  const page = await browser.newPage();

  try {
    await page.goto("https://www.scrapingcourse.com/button-click", {
      waitUntil: "networkidle2",
    });

    const scrapeVisibleProducts = async () => {
      return await page.evaluate(() => {
        const products = document.querySelectorAll(".product-item");
        return Array.from(products).map((product) => ({
          name: product.querySelector(".product-name")?.innerText || "N/A",
          price: product.querySelector(".product-price")?.innerText || "N/A",
          image: product.querySelector(".product-image")?.src || "N/A",
          link: product.querySelector("a")?.href || "N/A",
        }));
      });
    };

    let allProducts = await scrapeVisibleProducts();
    console.log("Initial Products:", allProducts);

    const loadMoreButtonSelector = "#load-more-btn";
    const n = 4; // Number of times to click the load more button
    let clickCount = 0;

    while (clickCount < n) {
      const loadMoreButton = await page.$(loadMoreButtonSelector);
      if (!loadMoreButton) break;

      const isClickable = await page.$eval(loadMoreButtonSelector, (button) => {
        return (
          button.offsetWidth > 0 && button.offsetHeight > 0 && !button.disabled
        );
      });

      if (isClickable) {
        await loadMoreButton.click();
        clickCount++;
      } else {
        console.log("Load More button is not clickable.");
        break;
      }

      await delay(2000);

      const newProducts = await scrapeVisibleProducts();
      console.log("New Products:", newProducts);
      allProducts = allProducts.concat(newProducts);
    }

    return allProducts;
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    await page.close();
  }
}

// Main function to execute scraping
const main = async () => {
  const browser = await puppeteer.launch();
  try {
    // console.log("Retrieving products");
    // const allProducts = await scrapeProductsFromPage(browser);
    // console.log("Saving data to products.csv");
    // saveProductsToCSV(allProducts);

    console.log("Retrieving top 5 products from CSV");
    const top5Products = getUniquePricedProducts(5);

    // console.log(top5Products);

    const topProductsDetails = await getProductDetails(browser, top5Products);
    console.log("Top 5 Highest-Priced Product Details:", topProductsDetails);
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    await browser.close();
  }
};

main().catch(console.error);
