/**
 * 工具函数测试
 */

import { 
    processGeneratedText, 
    removeThinkingTags, 
    extractImageLinks,
    estimateTokens,
    estimateTokenUsage
} from '../index';

// 测试 removeThinkingTags
function testRemoveThinkingTags() {
    const input = '<think>This is thinking content</think>This is the actual output';
    const expected = 'This is the actual output';
    const result = removeThinkingTags(input);
    console.assert(result === expected, `removeThinkingTags failed: ${result}`);
    console.log('✓ removeThinkingTags passed');
}

// 测试 processGeneratedText
function testProcessGeneratedText() {
    const input = '<think>Thinking...</think>Hello world';
    const expected = '\nHello world\n';
    const result = processGeneratedText(input, 'dummy');
    console.assert(result === expected, `processGeneratedText failed: ${result}`);
    console.log('✓ processGeneratedText passed');
}

// 测试 extractImageLinks
function testExtractImageLinks() {
    const input = 'Here is an image ![[test.png]] and another [[image.jpg]]';
    const result = extractImageLinks(input);
    console.assert(result.fileNames.length === 2, 'extractImageLinks failed: wrong file count');
    console.assert(result.fileNames[0] === 'test.png', 'extractImageLinks failed: wrong first file');
    console.assert(result.fileNames[1] === 'image.jpg', 'extractImageLinks failed: wrong second file');
    console.assert(!result.cleanedText.includes('[['), 'extractImageLinks failed: links not removed');
    console.log('✓ extractImageLinks passed');
}

// 测试 estimateTokens
function testEstimateTokens() {
    const englishText = 'Hello world this is a test';
    const chineseText = '你好世界这是一个测试';
    
    const englishTokens = estimateTokens(englishText);
    const chineseTokens = estimateTokens(chineseText);
    
    console.assert(englishTokens > 0, 'estimateTokens failed: English tokens should be > 0');
    console.assert(chineseTokens > 0, 'estimateTokens failed: Chinese tokens should be > 0');
    console.log('✓ estimateTokens passed');
}

// 运行所有测试
console.log('Running utils tests...');
testRemoveThinkingTags();
testProcessGeneratedText();
testExtractImageLinks();
testEstimateTokens();
console.log('All tests passed!'); 