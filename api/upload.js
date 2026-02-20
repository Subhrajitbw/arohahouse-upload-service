import sharp from "sharp"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { v4 as uuidv4 } from "uuid"
import formidable from "formidable"
import fs from "fs"

export const config = {
  api: {
    bodyParser: false
  }
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY
  }
})

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      multiples: false
    })

    const [fields, files] = await form.parse(req)

    const file = files.file?.[0]

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const fileBuffer = fs.readFileSync(file.filepath)

    // Resize + convert to WebP
    const optimized = await sharp(fileBuffer)
      .rotate()
      .resize({ width: 2000, withoutEnlargement: true })
      .webp({
        quality: 85,
        effort: 4
      })
      .toBuffer()

    const key = `cms/${uuidv4()}.webp`

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: optimized,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable"
      })
    )

    return res.status(200).json({
      url: `${process.env.R2_PUBLIC_URL}/${key}`
    })

  } catch (err) {
    console.error("Upload error:", err)
    return res.status(500).json({ error: "Upload failed" })
  }
}