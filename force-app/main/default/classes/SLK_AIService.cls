/**
 * Single entry point for every Models API (Einstein Trust Layer) call made by the
 * Knowledge Command Center. Prompt helpers, JSON parsing, and text utilities live here
 * so model swaps and test mocking happen in one place.
 */
public with sharing class SLK_AIService {
    public static final String MODEL_NAME = 'sfdc_ai__DefaultGPT41';

    @TestVisible
    private static List<String> mockResponses;

    public class AIException extends Exception {
    }

    public static String generate(String systemPrompt, String userPrompt) {
        if (Test.isRunningTest()) {
            if (mockResponses == null || mockResponses.isEmpty()) {
                throw new AIException('No mock AI response queued');
            }
            return mockResponses.remove(0);
        }

        aiplatform.ModelsAPI.createChatGenerations_Response response;
        try {
            response = new aiplatform.ModelsAPI().createChatGenerations(buildRequest(systemPrompt, userPrompt));
        } catch (Exception e) {
            throw new AIException('Models API error: ' + e.getMessage());
        }
        return firstGeneration(response);
    }

    @TestVisible
    private static aiplatform.ModelsAPI.createChatGenerations_Request buildRequest(String systemPrompt, String userPrompt) {
        aiplatform.ModelsAPI_ChatMessageRequest systemMessage = new aiplatform.ModelsAPI_ChatMessageRequest();
        systemMessage.role = 'system';
        systemMessage.content = systemPrompt;

        aiplatform.ModelsAPI_ChatMessageRequest userMessage = new aiplatform.ModelsAPI_ChatMessageRequest();
        userMessage.role = 'user';
        userMessage.content = userPrompt;

        aiplatform.ModelsAPI_ChatGenerationsRequest body = new aiplatform.ModelsAPI_ChatGenerationsRequest();
        body.messages = new List<aiplatform.ModelsAPI_ChatMessageRequest>{ systemMessage, userMessage };

        aiplatform.ModelsAPI.createChatGenerations_Request request = new aiplatform.ModelsAPI.createChatGenerations_Request();
        request.modelName = MODEL_NAME;
        request.body = body;
        return request;
    }

    @TestVisible
    private static String firstGeneration(aiplatform.ModelsAPI.createChatGenerations_Response response) {
        if (
            response?.Code200?.generationDetails?.generations == null ||
            response.Code200.generationDetails.generations.isEmpty()
        ) {
            throw new AIException('The model returned no generations');
        }
        return response.Code200.generationDetails.generations[0].content;
    }

    public static Map<String, Object> generateJson(String systemPrompt, String userPrompt) {
        String raw = generate(
            systemPrompt +
            '\n\nRespond ONLY with one valid JSON object. No markdown, no code fences, no commentary.',
            userPrompt
        );
        Map<String, Object> parsed = parseJsonObject(raw);
        if (parsed == null) {
            throw new AIException('The model response was not valid JSON');
        }
        return parsed;
    }

    public static Map<String, Object> parseJsonObject(String raw) {
        if (String.isBlank(raw)) {
            return null;
        }
        String cleaned = raw.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replaceAll('```[a-zA-Z]*\\n?', '').replaceAll('```', '').trim();
        }
        Integer start = cleaned.indexOf('{');
        Integer finish = cleaned.lastIndexOf('}');
        if (start < 0 || finish <= start) {
            return null;
        }
        try {
            return (Map<String, Object>) JSON.deserializeUntyped(cleaned.substring(start, finish + 1));
        } catch (Exception e) {
            return null;
        }
    }

    public static String stripHtml(String html) {
        if (String.isBlank(html)) {
            return '';
        }
        return html.replaceAll('<br\\s*/?>', '\n')
            .replaceAll('</(p|li|h[1-6]|div)>', '\n')
            .stripHtmlTags()
            .replaceAll('\\n{3,}', '\n\n')
            .trim();
    }

    public static String truncate(String value, Integer maxLength) {
        if (value == null) {
            return '';
        }
        String normalized = value.replaceAll('\\s+', ' ').trim();
        return normalized.length() <= maxLength ? normalized : normalized.left(maxLength) + '…';
    }

    public static String getStr(Map<String, Object> source, String key) {
        Object value = source?.get(key);
        return value == null ? null : String.valueOf(value);
    }

    public static Integer getInt(Map<String, Object> source, String key, Integer fallback) {
        Object value = source?.get(key);
        if (value == null) {
            return fallback;
        }
        try {
            return Integer.valueOf(String.valueOf(value).replaceAll('[^0-9-]', ''));
        } catch (Exception e) {
            return fallback;
        }
    }

    public static List<Object> getList(Map<String, Object> source, String key) {
        Object value = source?.get(key);
        return value instanceof List<Object> ? (List<Object>) value : new List<Object>();
    }

    public static String pick(String value, Set<String> allowed, String fallback) {
        return value != null && allowed.contains(value) ? value : fallback;
    }

    public static final String HTML_RULES =
        'Rich text fields must be simple HTML using only <p>, <ul>, <ol>, <li>, <strong>, <em>, <code>, <pre>, <h3>. ' +
        'Never include <script>, <style>, inline styles, images, or links you are not certain about.';
}