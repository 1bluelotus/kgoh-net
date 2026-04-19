module.exports = function (eleventyConfig) {
    eleventyConfig.addPassthroughCopy({ "style.css": "style.css" });
    eleventyConfig.addPassthroughCopy({ "script.js": "script.js" });
    eleventyConfig.addPassthroughCopy({ "profile.png": "profile.png" });
    eleventyConfig.addPassthroughCopy({ "about-photo.png": "about-photo.png" });
    eleventyConfig.addPassthroughCopy({ "shamcheck-screenshot.png": "shamcheck-screenshot.png" });
    eleventyConfig.addPassthroughCopy({ "yamamoto-editorial.png": "yamamoto-editorial.png" });
    eleventyConfig.addPassthroughCopy({ "graphyte-photo.png": "graphyte-photo.png" });
    eleventyConfig.addPassthroughCopy({ "shamcheck-scan-interface.png": "shamcheck-scan-interface.png" });
    eleventyConfig.addPassthroughCopy({ "shamcheck-trading-cards.png": "shamcheck-trading-cards.png" });
    eleventyConfig.addPassthroughCopy({ "shamcheck-app-store.png": "shamcheck-app-store.png" });
    eleventyConfig.addPassthroughCopy({ "shamcheck-clarification.png": "shamcheck-clarification.png" });
    eleventyConfig.addPassthroughCopy({ "yamamoto-sketches.png": "yamamoto-sketches.png" });
    eleventyConfig.addPassthroughCopy({ "yamamoto-system.png": "yamamoto-system.png" });
    eleventyConfig.addPassthroughCopy({ "yamamoto-vogue.png": "yamamoto-vogue.png" });
    eleventyConfig.addPassthroughCopy({ "yamamoto-spread2.png": "yamamoto-spread2.png" });
    eleventyConfig.addPassthroughCopy({ "yamamoto-spread3.png": "yamamoto-spread3.png" });
    eleventyConfig.addPassthroughCopy({ "keven-goh-resume.pdf": "keven-goh-resume.pdf" });
    eleventyConfig.addPassthroughCopy({ "yamamoto.pdf": "yamamoto.pdf" });
    eleventyConfig.addPassthroughCopy({ "photos": "photos" });
    eleventyConfig.addPassthroughCopy({ "digimonke-screenshot.png": "digimonke-screenshot.png" });
    eleventyConfig.addPassthroughCopy({ "CNAME": "CNAME" });

    eleventyConfig.addCollection("blog", function (collectionApi) {
        return collectionApi.getFilteredByGlob("src/blog/*.md").sort((a, b) => b.date - a.date);
    });

    eleventyConfig.addFilter("blogDate", function (date) {
        const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        const d = new Date(date);
        return `${months[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}`;
    });

    return {
        dir: {
            input: "src",
            output: "_site",
            layouts: "_layouts"
        }
    };
};
