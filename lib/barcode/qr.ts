/**
 * QR code of the SKU as SVG. Phone cameras read a 10 mm QR at arm's length
 * where a 1D barcode of the same width is hopeless; 2D scanners at the till
 * read either. Error level M, no margin: the label supplies the quiet zone.
 */
import QRCode from "qrcode";

export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
}
