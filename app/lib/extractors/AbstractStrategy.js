import fetch from 'node-fetch';
import imageType from 'image-type';
import isSvg from 'is-svg';
import icoToPng from 'ico-to-png';
import hasha from 'hasha';
import sharp from 'sharp';

export default class AbstractStrategy {
	static getId() {
		throw new Error(`Please implement getId method in strategy`);
	}

	getParserFilesToInject() {
		throw new Error(`Please implement getParserFilesToInject method in strategy`);
	}

	parsePage() {
		throw new Error(`Please implement parsePage method in strategy`);
	};

	async handlePage(page, cdp) {
		let result = await page.evaluate(this.parsePage);
		return await this.processParserResult(result);
	}

	async processParserResult(parserResult) {
		return parserResult;
	}

	async downloadFile(src) {

		let result = {
			buffer: null,
			extension: null,
			origin: null,
		};

		if (src.match(/data:image\/[a-zA-Z0-9+]*?;base64,/)) {
			let data = src.split(",", 2)[1] || "";

			result.buffer = Buffer.from(data, 'base64');
			result.origin = "[inline]";
		} else {
			const response = await fetch(src);

			result.buffer = await response.buffer();
			result.origin = response.url || src;
		}

		const imageInfo = await imageType(result.buffer);

		if (imageInfo) {
			switch (imageInfo.ext) {
				case "jpg":
				case "png":
				case "gif":
					result.extension = imageInfo.ext;
					break;
				case "webp":
					result.buffer = await sharp(result.buffer)
						.png()
						.toBuffer();
					result.extension = "png";
					break;
				case"ico":
					let pngBuffer = await this.parseIco(result.buffer, src);

					if (pngBuffer === null) {
						return null;
					}

					result.buffer = pngBuffer;
					result.extension = "png";
					break;
				default:
					return null;
			}
		} else if (isSvg(result.buffer.toString()) === true) {
			result.extension = "svg";
		} else {
			return null;
		}

		return result;
	}

	/** @param {string} svg */
	async parseSvg(svg) {
		if (isSvg(svg)) {
			return {
				buffer: Buffer.from(svg),
				extension: "svg",
				origin: "[inline]",
			};
		} else {
			return null;
		}
	}

	async parseIco(icoBuffer) {
		try {
			let pngBuffer = await icoToPng(icoBuffer, 1024);
			let imageInfo = await imageType(pngBuffer);

			return (imageInfo.ext === "png") ? pngBuffer : null;
		} catch (e) {
			console.log(e);

			return null;
		}
	}

	async processDownload(url, weight) {

		try {
			let imageDefinition = await this.downloadFile(url);

			if (!imageDefinition) {
				return null;
			}

			return {
				buffer: imageDefinition.buffer,
				hash: this.getBufferHash(imageDefinition.buffer),
				extension: imageDefinition.extension,
				origin: imageDefinition.origin,
				weight: weight,
			};
		} catch (e) {
			console.log(e);

			return null;
		}
	}

	getBufferHash(buffer) {
		return hasha(buffer, {algorithm: 'md5'});
	}
}
