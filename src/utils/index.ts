export const extractImages = (result: any): string[] => {
  const images: string[] = [];
  try {
    if (result.state?._generatedItems) {
      for (const item of result.state._generatedItems) {
        if (
          item.type === "tool_call_item" &&
          item.rawItem?.name === "image_generation_call" &&
          item.rawItem?.status === "completed"
        ) {
          const data = item.rawItem.output;
          if (typeof data === "string" && data.startsWith("iVBORw0KGgo"))
            images.push(`data:image/png;base64,${data}`);
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
  return [...new Set(images)];
};

export const extractFunctionCalls = (result: any): any[] => {
  const calls: any[] = [];
  try {
    if (result.state?._generatedItems) {
      for (const item of result.state._generatedItems) {
        if (item.type === "tool_call_item" && item.rawItem?.name) {
          calls.push({
            name: item.rawItem.name,
            status: item.rawItem.status,
            input: item.rawItem.input,
            output: item.rawItem.output,
          });
        }
      }
    }
  } catch {}
  return calls;
};
