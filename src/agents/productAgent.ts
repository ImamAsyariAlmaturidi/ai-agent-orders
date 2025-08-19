import { Agent, tool } from "@openai/agents";
import { z } from "zod";

// Wrap getProducts
export const getProductsTool = tool({
  name: "get_products",
  description: "Retrieve list of products",
  parameters: z.object({}),
  async execute(input) {
    const products = [
      {
        id: 1,
        type: "product",
        name: "Karma Knows",
        price: 150000,
      },
      {
        id: 2,
        type: "product",
        name: "Zen Hoodie",
        price: 320000,
      },
      {
        id: 3,
        type: "product",
        name: "Satori Sneakers",
        price: 650000,
      },
    ];

    const data = products;
    console.log("Fetched products:", data);
    return data;
  },
});

// Wrap getProductDetail
const getProductDetailTool = tool({
  name: "get_product_detail",
  description: "Get product detail by ID",
  parameters: z.object({ productId: z.string() }),
  async execute(input) {
    // return ProductTool.getProductDetail(input);
  },
});

export const ProductAgent = new Agent({
  name: "Product Agent",
  instructions: "You are a helpful Product agent.",
  model: "o4-mini",
  tools: [getProductsTool, getProductDetailTool],
});
