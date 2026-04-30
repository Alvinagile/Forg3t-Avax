import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const filename = formData.get('filename') as string || file?.name || 'document.pdf';

    if (!file) {
      throw new Error("File is required.");
    }

    const pinataJwt = Deno.env.get("PINATA_JWT");

    if (!pinataJwt) {
      throw new Error("PINATA_JWT is not configured.");
    }

    // Log upload attempt (without sensitive data)
    console.log(`[IPFS] Uploading file: ${filename}, size: ${file.size} bytes`);
    
    // File is already a Blob, no need to convert
    const blob = file;

    const pinataFormData = new FormData();
    pinataFormData.append("file", blob, filename);

    const pinataResponse = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pinataJwt}`,
      },
      body: pinataFormData,
    });

    if (!pinataResponse.ok) {
      const errorData = await pinataResponse.json();
      throw new Error(`Pinata upload failed: ${errorData.error?.details || pinataResponse.statusText}`);
    }

    const pinataResult = await pinataResponse.json();
    const ipfsCid = pinataResult.IpfsHash;

    console.log(`[IPFS] Upload successful: ${ipfsCid}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        ipfsCid,
        pinataResult,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    console.error("[IPFS] Upload failed:", error instanceof Error ? error.message : 'Unknown error');
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }
});
