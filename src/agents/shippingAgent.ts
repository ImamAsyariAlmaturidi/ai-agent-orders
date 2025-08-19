import { Agent, tool } from "@openai/agents";
import { z } from "zod";

// Wrap trackShipment as proper tool
const trackShipmentTool = tool({
  name: "track_shipment",
  description: "Track a shipment by its tracking number",
  parameters: z.object({ trackingNumber: z.string() }),
  async execute(input) {
    const { trackingNumber } = input;
    // Simulate shipment tracking
    return `Shipment with tracking number ${trackingNumber} is in transit.`;
  },
});

export const ShippingAgent = new Agent({
  name: "Shipping Agent",
  instructions: "You are a helpful shipping agent.",
  model: "o4-mini",
  tools: [trackShipmentTool],
});
