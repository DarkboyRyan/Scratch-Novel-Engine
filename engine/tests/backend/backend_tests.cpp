// 文件职责：端到端验证 JSONL Backend、Author 序列化和会话 revision。
// 关键覆盖：exact params、v1–v21 迁移、恶意输入、资源命令及失败原子性。
#include <algorithm>
#include <array>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iostream>
#include <iterator>
#include <limits>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

#include "backend.hpp"
#include "asset_import.hpp"
#include "serialization.hpp"

namespace {

using Json = nlohmann::json;

void check(const bool condition, const std::string& expression) {
  if (!condition) {
    throw std::runtime_error("check failed: " + expression);
  }
}

#define CHECK(expression) check((expression), #expression)

std::string png_image_bytes() {
  constexpr std::array<unsigned char, 16> bytes{
      0x89U,
      0x50U,
      0x4eU,
      0x47U,
      0x0dU,
      0x0aU,
      0x1aU,
      0x0aU,
      0x00U,
      0x00U,
      0x00U,
      0x00U,
      0x49U,
      0x45U,
      0x4eU,
      0x44U,
  };
  return std::string(
      reinterpret_cast<const char*>(bytes.data()), bytes.size());
}

std::string jpeg_image_bytes() {
  constexpr std::array<unsigned char, 8> bytes{
      0xffU, 0xd8U, 0xffU, 0xe0U, 0x00U, 0x02U, 0xffU, 0xd9U};
  return std::string(
      reinterpret_cast<const char*>(bytes.data()), bytes.size());
}

std::string mp4_video_bytes() {
  constexpr std::array<unsigned char, 24> bytes{
      0x00U, 0x00U, 0x00U, 0x18U, 'f', 't', 'y', 'p',
      'i', 's', 'o', 'm', 0x00U, 0x00U, 0x02U, 0x00U,
      'i', 's', 'o', 'm', 'm', 'p', '4', '2'};
  return std::string(
      reinterpret_cast<const char*>(bytes.data()), bytes.size());
}

std::string mp3_audio_bytes() {
  std::string bytes(417, '\0');
  bytes[0] = static_cast<char>(0xffU);
  bytes[1] = static_cast<char>(0xfbU);
  bytes[2] = static_cast<char>(0x90U);
  bytes[3] = static_cast<char>(0x64U);
  return bytes;
}

Json valid_document() {
  return {
      {"format", "vn-engine-project"},
      {"fileVersion", 1},
      {"project",
       {
           {"schemaVersion", 1},
           {"id", "project-1"},
           {"name", "读取的项目"},
           {"entrySceneId", "scene-1"},
           {"scenes",
            Json::array({
                {
                    {"schemaVersion", 1},
                    {"id", "scene-1"},
                    {"name", "序章"},
                    {"nodes",
                     Json::array({
                         {
                             {"id", "dialogue-1"},
                             {"type", "dialogue"},
                             {"speaker", "Alice"},
                             {"text", "你好"},
                         },
                     })},
                },
            })},
       }},
      {"assets",
       Json::array({
           {
               {"id", "asset-image-1"},
               {"type", "image"},
               {"relativePath", "assets/images/classroom.png"},
               {"displayName", "教室"},
           },
           {
               {"id", "asset-video-1"},
               {"type", "video"},
               {"relativePath", "assets/videos/opening.mp4"},
               {"displayName", "片头"},
           },
       })},
  };
}

Json migrated_v2_document() {
  Json document = valid_document();
  document["fileVersion"] = 2;
  document["project"]["scenes"][0]["visuals"] = {
      {"backgroundAssetId", nullptr},
      {"characters", Json::array()},
  };
  return document;
}

Json migrated_v3_document() {
  Json document = migrated_v2_document();
  document["fileVersion"] = 3;
  return document;
}

Json migrated_v4_document() {
  Json document = migrated_v3_document();
  document["fileVersion"] = 4;
  return document;
}

Json migrated_v5_document() {
  Json document = migrated_v4_document();
  document["fileVersion"] = 5;
  return document;
}

Json migrated_v6_document() {
  Json document = migrated_v5_document();
  document["fileVersion"] = 6;
  return document;
}

Json migrated_to_v7(Json document) {
  document["fileVersion"] = 7;
  for (Json& scene : document["project"]["scenes"]) {
    for (Json& node : scene["nodes"]) {
      if (node.at("type") == "dialogue") {
        node["voiceAssetId"] = nullptr;
      }
    }
  }
  return document;
}

Json migrated_v7_document() {
  return migrated_to_v7(migrated_v6_document());
}

Json migrated_to_v8(Json document) {
  document = migrated_to_v7(std::move(document));
  document["fileVersion"] = 8;
  return document;
}

Json migrated_v8_document() {
  Json document = migrated_v7_document();
  document["fileVersion"] = 8;
  return document;
}

Json migrated_to_v9(Json document) {
  document = migrated_to_v8(std::move(document));
  document["fileVersion"] = 9;
  return document;
}

Json migrated_v9_document() {
  return migrated_to_v9(migrated_v8_document());
}

Json with_v10_start_screen(Json document) {
  document["fileVersion"] = 10;
  document["project"]["startScreen"] = {
      {"backgroundAssetId", nullptr},
      {"musicAssetId", nullptr},
  };
  return document;
}

Json migrated_to_v10(Json document) {
  return with_v10_start_screen(migrated_to_v9(std::move(document)));
}

Json migrated_v10_document() {
  return migrated_to_v10(migrated_v9_document());
}

Json with_v11_start_screen(Json document) {
  document = with_v10_start_screen(std::move(document));
  document["fileVersion"] = 11;
  document["project"]["startScreen"]["title"] =
      document.at("project").at("name");
  return document;
}

Json migrated_to_v11(Json document) {
  return with_v11_start_screen(migrated_to_v10(std::move(document)));
}

Json migrated_v11_document() {
  return migrated_to_v11(migrated_v10_document());
}

Json migrated_to_v12(Json document) {
  document = migrated_to_v11(std::move(document));
  document["fileVersion"] = 12;
  return document;
}

Json with_v12_start_screen(Json document) {
  document = with_v11_start_screen(std::move(document));
  document["fileVersion"] = 12;
  return document;
}

Json migrated_v12_document() {
  return migrated_to_v12(migrated_v11_document());
}

Json migrated_to_v13(Json document) {
  document = migrated_to_v12(std::move(document));
  document["fileVersion"] = 13;
  for (Json& scene : document["project"]["scenes"]) {
    for (Json& node : scene["nodes"]) {
      if (node.at("type") == "character") {
        node["position"] = nullptr;
      }
    }
  }
  return document;
}

Json with_v13_start_screen(Json document) {
  document = with_v12_start_screen(std::move(document));
  document["fileVersion"] = 13;
  for (Json& scene : document["project"]["scenes"]) {
    for (Json& node : scene["nodes"]) {
      if (node.at("type") == "character") {
        node["position"] = nullptr;
      }
    }
  }
  return document;
}

Json migrated_v13_document() {
  return migrated_to_v13(migrated_v12_document());
}

Json with_v14_cg_gallery(Json document) {
  document["fileVersion"] = 14;
  document["project"]["cgGallery"] = {
      {"imageAssetIds", Json::array()},
  };
  return document;
}

Json migrated_to_v14(Json document) {
  return with_v14_cg_gallery(migrated_to_v13(std::move(document)));
}

Json migrated_v14_document() {
  return with_v14_cg_gallery(migrated_v13_document());
}

Json with_v15_cg_pages(Json document) {
  Json packed_ids = Json::array();
  if (document.at("fileVersion").get<int>() >= 14) {
    packed_ids = document.at("project")
                     .at("cgGallery")
                     .at("imageAssetIds");
  }

  Json pages = Json::array();
  const std::size_t page_count = std::max<std::size_t>(
      1U,
      (packed_ids.size() + vnengine::kCgGalleryPageSize - 1U) /
          vnengine::kCgGalleryPageSize);
  for (std::size_t page_index = 0; page_index < page_count; ++page_index) {
    Json slots = Json::array();
    for (std::size_t slot_index = 0;
         slot_index < vnengine::kCgGalleryPageSize;
         ++slot_index) {
      const std::size_t packed_index =
          page_index * vnengine::kCgGalleryPageSize + slot_index;
      slots.push_back(
          packed_index < packed_ids.size()
              ? packed_ids.at(packed_index)
              : Json(nullptr));
    }
    pages.push_back({{"imageAssetIds", std::move(slots)}});
  }

  document["fileVersion"] = 15;
  document["project"]["cgGallery"] = {{"pages", std::move(pages)}};
  return document;
}

Json migrated_to_v15(Json document) {
  return with_v15_cg_pages(migrated_to_v14(std::move(document)));
}

Json migrated_v15_document() {
  return with_v15_cg_pages(migrated_v14_document());
}

Json with_v16_logic(Json document) {
  document["fileVersion"] = 16;
  return document;
}

Json migrated_to_v16(Json document) {
  return with_v16_logic(migrated_to_v15(std::move(document)));
}

Json migrated_v16_document() {
  return with_v16_logic(migrated_v15_document());
}

Json with_v17_cg_display(Json document) {
  document["fileVersion"] = 17;
  return document;
}

Json migrated_to_v17(Json document) {
  return with_v17_cg_display(migrated_to_v16(std::move(document)));
}

Json migrated_v17_document() {
  return with_v17_cg_display(migrated_v16_document());
}

Json with_v18_character_effects(Json document) {
  document["fileVersion"] = 18;
  for (Json& scene : document["project"]["scenes"]) {
    for (Json& node : scene["nodes"]) {
      if (node.at("type") == "character") {
        node["effect"] = nullptr;
      }
    }
  }
  return document;
}

Json migrated_to_v18(Json document) {
  return with_v18_character_effects(migrated_to_v17(std::move(document)));
}

Json migrated_v18_document() {
  return with_v18_character_effects(migrated_v17_document());
}

Json with_v19_character_modes(Json document) {
  document["fileVersion"] = 19;
  for (Json& scene : document["project"]["scenes"]) {
    for (Json& node : scene["nodes"]) {
      if (node.at("type") == "character") {
        node["mode"] = node.at("assetId").is_null() ? "clear" : "show";
      }
    }
  }
  return document;
}

Json migrated_to_v19(Json document) {
  return with_v19_character_modes(migrated_to_v18(std::move(document)));
}

Json migrated_v19_document() {
  return with_v19_character_modes(migrated_v18_document());
}

Json with_v20_start_screen_eyebrow(Json document) {
  document["fileVersion"] = 20;
  document["project"]["startScreen"]["eyebrow"] = "A VN ENGINE STORY";
  return document;
}

Json migrated_to_v20(Json document) {
  return with_v20_start_screen_eyebrow(
      migrated_to_v19(std::move(document)));
}

Json migrated_v20_document() {
  return with_v20_start_screen_eyebrow(migrated_v19_document());
}

Json with_v21_image_scale(Json document) {
  document["fileVersion"] = 21;
  for (Json& scene : document["project"]["scenes"]) {
    scene["visuals"]["backgroundScalePercent"] =
        vnengine::kDefaultImageScalePercent;
    for (Json& node : scene["nodes"]) {
      if (node.at("type") == "background" ||
          node.at("type") == "character") {
        node["scalePercent"] = vnengine::kDefaultImageScalePercent;
      }
    }
  }
  return document;
}

Json migrated_to_v21(Json document) {
  return with_v21_image_scale(migrated_to_v20(std::move(document)));
}

Json migrated_v21_document() {
  return with_v21_image_scale(migrated_v20_document());
}

Json cg_page_json(
    const std::initializer_list<std::pair<std::size_t, std::string>> entries =
        {}) {
  Json slots = Json::array();
  for (std::size_t index = 0;
       index < vnengine::kCgGalleryPageSize;
       ++index) {
    slots.push_back(nullptr);
  }
  for (const auto& [index, asset_id] : entries) {
    slots.at(index) = asset_id;
  }
  return {{"imageAssetIds", std::move(slots)}};
}

Json valid_v2_visual_document() {
  Json document = migrated_v2_document();
  document["project"]["scenes"][0]["visuals"] = {
      {"backgroundAssetId", "asset-image-1"},
      {"characters",
       Json::array({
           {
               {"id", "visual-alice-back"},
               {"assetId", "asset-image-1"},
               {"slot", "right"},
           },
           {
               {"id", "visual-alice-front"},
               {"assetId", "asset-image-1"},
               {"slot", "left"},
           },
       })},
  };
  return document;
}

Json valid_v3_timeline_document() {
  Json document = migrated_v3_document();
  document["project"]["scenes"][0]["visuals"]["backgroundAssetId"] =
      "asset-image-1";
  document["project"]["scenes"][0]["nodes"] = Json::array({
      {
          {"id", "dialogue-1"},
          {"type", "dialogue"},
          {"speaker", "Alice"},
          {"text", "切换前"},
      },
      {
          {"id", "background-1"},
          {"type", "background"},
          {"assetId", "asset-image-1"},
      },
      {
          {"id", "dialogue-2"},
          {"type", "dialogue"},
          {"speaker", "Bob"},
          {"text", "切换后"},
      },
  });
  return document;
}

void expect_file_error(
    const Json& document,
    const vnengine::backend::ProjectFileErrorKind expected_kind) {
  try {
    static_cast<void>(
        vnengine::backend::project_file_from_json(document));
  } catch (const vnengine::backend::ProjectFileError& error) {
    CHECK(error.kind() == expected_kind);
    return;
  }
  throw std::runtime_error("expected ProjectFileError");
}

void reads_v1_and_writes_a_migrated_v21_document() {
  const Json source = valid_document();
  const vnengine::backend::ProjectFileDocument parsed =
      vnengine::backend::project_file_from_json(source);

  CHECK(parsed.project.id == "project-1");
  CHECK(parsed.project.name == "读取的项目");
  CHECK(parsed.project.scenes.size() == 1);
  CHECK(parsed.project.scenes[0].nodes.size() == 1);
  CHECK(std::get<vnengine::Dialogue>(
            parsed.project.scenes[0].nodes[0]).text == "你好");
  CHECK(!std::get<vnengine::Dialogue>(
             parsed.project.scenes[0].nodes[0])
             .voice_asset_id.has_value());
  CHECK(!parsed.project.scenes[0].visuals.background_asset_id.has_value());
  CHECK(parsed.project.scenes[0].visuals.characters.empty());
  CHECK(parsed.project.start_screen.title == parsed.project.name);
  CHECK(parsed.project.start_screen.eyebrow == "A VN ENGINE STORY");
  CHECK(!parsed.project.start_screen.background_asset_id.has_value());
  CHECK(!parsed.project.start_screen.music_asset_id.has_value());
  CHECK(parsed.assets.size() == 2);
  CHECK(parsed.assets[0].type == vnengine::AssetType::image);
  CHECK(parsed.assets[1].type == vnengine::AssetType::video);
  CHECK(
      vnengine::backend::project_file_to_json(parsed) ==
      migrated_v21_document());
}

void round_trips_v2_visuals_and_preserves_character_order() {
  const Json source = valid_v2_visual_document();
  const vnengine::backend::ProjectFileDocument parsed =
      vnengine::backend::project_file_from_json(source);

  const vnengine::SceneVisualState& visuals =
      parsed.project.scenes[0].visuals;
  CHECK(visuals.background_asset_id == "asset-image-1");
  CHECK(visuals.characters.size() == 2);
  CHECK(visuals.characters[0].id == "visual-alice-back");
  CHECK(visuals.characters[0].slot == vnengine::CharacterSlot::right);
  CHECK(visuals.characters[1].id == "visual-alice-front");
  CHECK(visuals.characters[1].slot == vnengine::CharacterSlot::left);
  Json expected = migrated_to_v21(source);
  CHECK(vnengine::backend::project_file_to_json(parsed) == expected);
}

void migrates_and_round_trips_v21_image_scales_strictly() {
  using Kind = vnengine::backend::ProjectFileErrorKind;

  Json legacy = migrated_v20_document();
  legacy["project"]["scenes"][0]["visuals"]["backgroundAssetId"] =
      "asset-image-1";
  legacy["project"]["scenes"][0]["nodes"].push_back({
      {"id", "background-scale"},
      {"type", "background"},
      {"assetId", "asset-image-1"},
  });
  legacy["project"]["scenes"][0]["nodes"].push_back({
      {"id", "character-scale"},
      {"type", "character"},
      {"mode", "show"},
      {"assetId", "asset-image-1"},
      {"slot", "center"},
      {"layer", 1},
      {"position", nullptr},
      {"effect", nullptr},
  });
  const auto migrated = vnengine::backend::project_file_from_json(legacy);
  CHECK(migrated.project.scenes[0].visuals.background_scale_percent == 100);
  CHECK(std::get<vnengine::BackgroundNode>(
            migrated.project.scenes[0].nodes[1])
            .scale_percent == 100);
  CHECK(std::get<vnengine::CharacterNode>(
            migrated.project.scenes[0].nodes[2])
            .scale_percent == 100);

  Json forged_legacy = legacy;
  forged_legacy["project"]["scenes"][0]["visuals"]
               ["backgroundScalePercent"] = 100;
  expect_file_error(forged_legacy, Kind::invalid_document);
  forged_legacy = legacy;
  forged_legacy["project"]["scenes"][0]["nodes"][1]["scalePercent"] = 100;
  expect_file_error(forged_legacy, Kind::invalid_document);

  Json source = vnengine::backend::project_file_to_json(migrated);
  Json& scene = source["project"]["scenes"][0];
  scene["visuals"]["backgroundScalePercent"] = 150;
  scene["nodes"][1]["scalePercent"] = 80;
  scene["nodes"][2]["scalePercent"] = 125;
  const auto parsed = vnengine::backend::project_file_from_json(source);
  CHECK(parsed.project.scenes[0].visuals.background_scale_percent == 150);
  CHECK(std::get<vnengine::BackgroundNode>(parsed.project.scenes[0].nodes[1])
            .scale_percent == 80);
  CHECK(std::get<vnengine::CharacterNode>(parsed.project.scenes[0].nodes[2])
            .scale_percent == 125);
  CHECK(vnengine::backend::project_file_to_json(parsed) == source);

  for (const Json& invalid_scale :
       {Json(9), Json(301), Json(100.5), Json(true)}) {
    Json malformed = source;
    malformed["project"]["scenes"][0]["visuals"]
             ["backgroundScalePercent"] = invalid_scale;
    expect_file_error(malformed, Kind::invalid_document);

    malformed = source;
    malformed["project"]["scenes"][0]["nodes"][1]["scalePercent"] =
        invalid_scale;
    expect_file_error(malformed, Kind::invalid_document);

    malformed = source;
    malformed["project"]["scenes"][0]["nodes"][2]["scalePercent"] =
        invalid_scale;
    expect_file_error(malformed, Kind::invalid_document);
  }

  for (const std::string& path_kind : {"scene", "background", "character"}) {
    Json malformed = source;
    if (path_kind == "scene") {
      malformed["project"]["scenes"][0]["visuals"].erase(
          "backgroundScalePercent");
    } else {
      malformed["project"]["scenes"][0]["nodes"]
               [path_kind == "background" ? 1 : 2]
                   .erase("scalePercent");
    }
    expect_file_error(malformed, Kind::invalid_document);
  }

  Json malformed = source;
  malformed["project"]["scenes"][0]["visuals"]["backgroundAssetId"] =
      nullptr;
  malformed["project"]["scenes"][0]["visuals"]
           ["backgroundScalePercent"] = 150;
  expect_file_error(malformed, Kind::invalid_document);

  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["assetId"] = nullptr;
  expect_file_error(malformed, Kind::invalid_document);

  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][2]["mode"] = "clear";
  malformed["project"]["scenes"][0]["nodes"][2]["assetId"] = nullptr;
  expect_file_error(malformed, Kind::invalid_document);
}

void v1_reader_rejects_unversioned_visual_fields() {
  Json document = valid_document();
  document["project"]["scenes"][0]["visuals"] = {
      {"backgroundAssetId", "asset-image-1"},
      {"characters", Json::array()},
  };

  expect_file_error(
      document,
      vnengine::backend::ProjectFileErrorKind::invalid_document);
}

void rejects_unsupported_and_malformed_project_documents() {
  using Kind = vnengine::backend::ProjectFileErrorKind;

  Json document = valid_document();
  document["format"] = "another-engine";
  expect_file_error(document, Kind::unsupported_format);

  document = valid_document();
  document["fileVersion"] = 22;
  expect_file_error(document, Kind::unsupported_format);

  document = valid_document();
  document["fileVersion"] = 0;
  expect_file_error(document, Kind::unsupported_format);

  document = valid_document();
  document["fileVersion"] = "2";
  expect_file_error(document, Kind::invalid_document);

  document = valid_document();
  document["project"]["schemaVersion"] = 2;
  expect_file_error(document, Kind::unsupported_format);

  document = valid_document();
  document["unexpected"] = true;
  expect_file_error(document, Kind::invalid_document);

  document = valid_document();
  document.erase("assets");
  expect_file_error(document, Kind::invalid_document);

  document = valid_document();
  document["project"]["entrySceneId"] = "missing";
  expect_file_error(document, Kind::invalid_document);

  document = valid_document();
  document["project"]["id"] = "scene-1";
  expect_file_error(document, Kind::invalid_document);

  document = valid_document();
  document["assets"][0]["relativePath"] =
      "assets/images/../../outside.png";
  expect_file_error(document, Kind::invalid_document);

  document = valid_document();
  document["assets"][0]["id"] = "dialogue-1";
  expect_file_error(document, Kind::invalid_document);

  document = valid_document();
  document["assets"][0]["type"] = "executable";
  expect_file_error(document, Kind::unsupported_format);
}

void rejects_malformed_v2_visual_fields_strictly() {
  using Kind = vnengine::backend::ProjectFileErrorKind;

  Json document = valid_v2_visual_document();
  document["project"]["scenes"][0].erase("visuals");
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["unexpected"] = true;
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"].erase(
      "backgroundAssetId");
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"].erase("characters");
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["unexpected"] = true;
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"] = nullptr;
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["backgroundAssetId"] = 7;
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["characters"] =
      Json::object();
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["characters"][0] =
      "not an object";
  expect_file_error(document, Kind::invalid_document);

  for (const std::string& field : {"id", "assetId", "slot"}) {
    document = valid_v2_visual_document();
    document["project"]["scenes"][0]["visuals"]["characters"][0].erase(
        field);
    expect_file_error(document, Kind::invalid_document);
  }

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["characters"][0]
          ["unexpected"] = true;
  expect_file_error(document, Kind::invalid_document);

  for (const std::string& field : {"id", "assetId", "slot"}) {
    document = valid_v2_visual_document();
    document["project"]["scenes"][0]["visuals"]["characters"][0][field] =
        7;
    expect_file_error(document, Kind::invalid_document);
  }

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["characters"][0]["slot"] =
      "foreground";
  expect_file_error(document, Kind::invalid_document);

  // Structural parsing succeeds first; aggregate validation then rejects
  // references that cannot be resolved to an image Asset.
  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["backgroundAssetId"] =
      "missing-asset";
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["backgroundAssetId"] =
      "asset-video-1";
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["characters"][0]["assetId"] =
      "missing-asset";
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["characters"][0]["assetId"] =
      "asset-video-1";
  expect_file_error(document, Kind::invalid_document);
}

void round_trips_v3_mixed_timeline_strictly() {
  using Kind = vnengine::backend::ProjectFileErrorKind;

  const Json source = valid_v3_timeline_document();
  const vnengine::backend::ProjectFileDocument parsed =
      vnengine::backend::project_file_from_json(source);
  const vnengine::Scene& scene = parsed.project.scenes[0];
  CHECK(scene.nodes.size() == 3);
  CHECK(std::holds_alternative<vnengine::Dialogue>(scene.nodes[0]));
  CHECK(std::get<vnengine::BackgroundNode>(scene.nodes[1]).id ==
        "background-1");
  CHECK(std::get<vnengine::BackgroundNode>(scene.nodes[1]).asset_id ==
        "asset-image-1");
  CHECK(std::holds_alternative<vnengine::Dialogue>(scene.nodes[2]));
  Json migrated_source = migrated_to_v21(source);
  CHECK(vnengine::backend::project_file_to_json(parsed) == migrated_source);

  Json no_background_source = migrated_to_v21(source);
  no_background_source["project"]["scenes"][0]["nodes"][1]["assetId"] =
      nullptr;
  const auto no_background =
      vnengine::backend::project_file_from_json(no_background_source);
  CHECK(!std::get<vnengine::BackgroundNode>(
             no_background.project.scenes[0].nodes[1])
             .asset_id.has_value());
  CHECK(vnengine::backend::project_file_to_json(no_background) ==
        no_background_source);

  const Json renderer = vnengine::backend::project_to_json(parsed.project);
  CHECK(renderer.at("scenes")[0].at("nodes") ==
        migrated_source.at("project").at("scenes")[0].at("nodes"));

  for (const std::string& missing : {"id", "type", "assetId"}) {
    Json malformed = source;
    malformed["project"]["scenes"][0]["nodes"][1].erase(missing);
    expect_file_error(malformed, Kind::invalid_document);
  }

  Json malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["unexpected"] = true;
  expect_file_error(malformed, Kind::invalid_document);

  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["assetId"] = 7;
  expect_file_error(malformed, Kind::invalid_document);

  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["type"] = "camera";
  expect_file_error(malformed, Kind::unsupported_format);

  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["assetId"] =
      "asset-video-1";
  expect_file_error(malformed, Kind::invalid_document);

  // Older versions remain dialogue-only, even if the node happens to have a
  // shape understood by v3.
  malformed = source;
  malformed["fileVersion"] = 2;
  expect_file_error(malformed, Kind::invalid_document);
}

void migrates_v1_through_v6_dialogues_to_null_voice() {
  const std::vector<Json> legacy_documents{
      valid_document(),
      migrated_v2_document(),
      migrated_v3_document(),
      migrated_v4_document(),
      migrated_v5_document(),
      migrated_v6_document(),
  };
  for (const Json& legacy : legacy_documents) {
    const auto parsed = vnengine::backend::project_file_from_json(legacy);
    const auto& dialogue = std::get<vnengine::Dialogue>(
        parsed.project.scenes[0].nodes[0]);
    CHECK(!dialogue.voice_asset_id.has_value());
    const Json migrated = vnengine::backend::project_file_to_json(parsed);
    CHECK(migrated.at("fileVersion") == 21);
    CHECK(migrated.at("project").at("startScreen") == Json({
        {"title", "读取的项目"},
        {"eyebrow", "A VN ENGINE STORY"},
        {"backgroundAssetId", nullptr},
        {"musicAssetId", nullptr}}));
    CHECK(migrated.at("project")
              .at("scenes")[0]
              .at("nodes")[0]
              .at("voiceAssetId")
              .is_null());
  }
}

void round_trips_v7_audio_timeline_strictly() {
  using Kind = vnengine::backend::ProjectFileErrorKind;
  Json source = migrated_v7_document();
  source["assets"].push_back({
      {"id", "asset-audio-1"},
      {"type", "audio"},
      {"relativePath", "assets/audio/voice.mp3"},
      {"displayName", "Alice voice"},
  });
  source["project"]["scenes"][0]["nodes"][0]["voiceAssetId"] =
      "asset-audio-1";
  source["project"]["scenes"][0]["nodes"].push_back({
      {"id", "bgm-1"},
      {"type", "bgm"},
      {"assetId", "asset-audio-1"},
  });

  const auto parsed = vnengine::backend::project_file_from_json(source);
  const auto& dialogue = std::get<vnengine::Dialogue>(
      parsed.project.scenes[0].nodes[0]);
  CHECK(dialogue.voice_asset_id == "asset-audio-1");
  const auto& bgm = std::get<vnengine::BgmNode>(
      parsed.project.scenes[0].nodes[1]);
  CHECK(bgm.asset_id == "asset-audio-1");
  Json migrated = with_v21_image_scale(with_v20_start_screen_eyebrow(
      with_v19_character_modes(with_v18_character_effects(
      with_v17_cg_display(with_v16_logic(with_v15_cg_pages(
          with_v14_cg_gallery(with_v13_start_screen(source)))))))));
  CHECK(vnengine::backend::project_file_to_json(parsed) == migrated);
  CHECK(vnengine::backend::project_to_json(parsed.project)
            .at("scenes")[0]
            .at("nodes") ==
        source.at("project").at("scenes")[0].at("nodes"));

  Json malformed = source;
  malformed["project"]["scenes"][0]["nodes"][0].erase("voiceAssetId");
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][0]["voiceAssetId"] = 7;
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][0]["voiceAssetId"] =
      "asset-image-1";
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["assetId"] =
      "asset-image-1";
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["unexpected"] = true;
  expect_file_error(malformed, Kind::invalid_document);

  Json legacy_with_bgm = migrated_v6_document();
  legacy_with_bgm["project"]["scenes"][0]["nodes"].push_back({
      {"id", "bgm-legacy"}, {"type", "bgm"}, {"assetId", nullptr}});
  expect_file_error(legacy_with_bgm, Kind::unsupported_format);
}

void round_trips_v8_video_timeline_strictly() {
  using Kind = vnengine::backend::ProjectFileErrorKind;
  Json source = migrated_v8_document();
  source["project"]["scenes"][0]["nodes"].push_back({
      {"id", "video-1"},
      {"type", "video"},
      {"assetId", "asset-video-1"},
  });

  const auto parsed = vnengine::backend::project_file_from_json(source);
  const auto& video = std::get<vnengine::VideoNode>(
      parsed.project.scenes[0].nodes[1]);
  CHECK(video.asset_id == "asset-video-1");
  Json migrated = with_v21_image_scale(with_v20_start_screen_eyebrow(
      with_v19_character_modes(with_v18_character_effects(
      with_v17_cg_display(with_v16_logic(with_v15_cg_pages(
          with_v14_cg_gallery(with_v13_start_screen(source)))))))));
  CHECK(vnengine::backend::project_file_to_json(parsed) == migrated);
  CHECK(vnengine::backend::project_to_json(parsed.project)
            .at("scenes")[0]
            .at("nodes") ==
        source.at("project").at("scenes")[0].at("nodes"));

  Json malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1].erase("assetId");
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["assetId"] = 8;
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["assetId"] =
      "asset-image-1";
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["unexpected"] = true;
  expect_file_error(malformed, Kind::invalid_document);

  Json legacy_with_video = migrated_v7_document();
  legacy_with_video["project"]["scenes"][0]["nodes"].push_back({
      {"id", "video-legacy"},
      {"type", "video"},
      {"assetId", nullptr},
  });
  expect_file_error(legacy_with_video, Kind::unsupported_format);
}

void round_trips_v9_choice_timeline_strictly() {
  using Kind = vnengine::backend::ProjectFileErrorKind;
  Json source = migrated_v9_document();
  source["project"]["scenes"].push_back({
      {"schemaVersion", 1},
      {"id", "scene-2"},
      {"name", "第二幕"},
      {"visuals",
       {{"backgroundAssetId", nullptr}, {"characters", Json::array()}}},
      {"nodes", Json::array()},
  });
  source["project"]["scenes"][0]["nodes"].push_back({
      {"id", "choice-1"},
      {"type", "choice"},
      {"options",
       Json::array({
           {
               {"id", "option-1"},
               {"text", "继续"},
               {"targetSceneId", "scene-2"},
           },
           {
               {"id", "option-2"},
               {"text", "留下"},
               {"targetSceneId", "scene-1"},
           },
       })},
  });
  source["project"]["scenes"][1]["nodes"].push_back({
      {"id", "choice-empty"},
      {"type", "choice"},
      {"options", Json::array()},
  });

  const auto parsed = vnengine::backend::project_file_from_json(source);
  const auto& choice = std::get<vnengine::ChoiceNode>(
      parsed.project.scenes[0].nodes[1]);
  CHECK(choice.options.size() == 2);
  CHECK(choice.options[0].id == "option-1");
  CHECK(choice.options[0].text == "继续");
  CHECK(choice.options[0].target_scene_id == "scene-2");
  CHECK(std::get<vnengine::ChoiceNode>(
            parsed.project.scenes[1].nodes[0])
            .options.empty());
  CHECK(
      vnengine::backend::project_file_to_json(parsed) ==
      with_v21_image_scale(with_v20_start_screen_eyebrow(
          with_v19_character_modes(with_v18_character_effects(
          with_v17_cg_display(with_v16_logic(with_v15_cg_pages(
              with_v14_cg_gallery(with_v13_start_screen(source))))))))));
  CHECK(vnengine::backend::project_to_json(parsed.project)
            .at("scenes")[0]
            .at("nodes")[1] ==
        source.at("project").at("scenes")[0].at("nodes")[1]);

  for (const std::string& missing : {"id", "type", "options"}) {
    Json malformed = source;
    malformed["project"]["scenes"][0]["nodes"][1].erase(missing);
    expect_file_error(malformed, Kind::invalid_document);
  }
  for (const std::string& missing : {"id", "text", "targetSceneId"}) {
    Json malformed = source;
    malformed["project"]["scenes"][0]["nodes"][1]["options"][0].erase(
        missing);
    expect_file_error(malformed, Kind::invalid_document);
  }

  Json malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["options"] =
      Json::object();
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["unexpected"] = true;
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["options"][0]
           ["unexpected"] = true;
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["options"][0]["text"] =
      "  ";
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["options"][0]
           ["targetSceneId"] = "missing";
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["options"][1]["id"] =
      "option-1";
  expect_file_error(malformed, Kind::invalid_document);

  Json legacy_with_choice = migrated_v8_document();
  legacy_with_choice["project"]["scenes"][0]["nodes"].push_back({
      {"id", "choice-legacy"},
      {"type", "choice"},
      {"options", Json::array()},
  });
  expect_file_error(legacy_with_choice, Kind::unsupported_format);
}

void migrates_legacy_start_screens_and_round_trips_v14_strictly() {
  using Kind = vnengine::backend::ProjectFileErrorKind;

  const std::vector<Json> legacy_documents{
      valid_document(),
      migrated_v2_document(),
      migrated_v3_document(),
      migrated_v4_document(),
      migrated_v5_document(),
      migrated_v6_document(),
      migrated_v7_document(),
      migrated_v8_document(),
      migrated_v9_document(),
      migrated_v11_document(),
      migrated_v19_document(),
  };
  for (const Json& legacy : legacy_documents) {
    const auto parsed = vnengine::backend::project_file_from_json(legacy);
    CHECK(parsed.project.start_screen.title == parsed.project.name);
    CHECK(parsed.project.start_screen.eyebrow == "A VN ENGINE STORY");
    CHECK(!parsed.project.start_screen.background_asset_id.has_value());
    CHECK(!parsed.project.start_screen.music_asset_id.has_value());
    const Json migrated = vnengine::backend::project_file_to_json(parsed);
    CHECK(migrated.at("fileVersion") == 21);
    CHECK(migrated.at("project").at("startScreen") == Json({
        {"title", "读取的项目"},
        {"eyebrow", "A VN ENGINE STORY"},
        {"backgroundAssetId", nullptr},
        {"musicAssetId", nullptr}}));
  }

  Json legacy_v10 = migrated_v10_document();
  legacy_v10["assets"].push_back({
      {"id", "asset-audio-1"},
      {"type", "audio"},
      {"relativePath", "assets/audio/title.mp3"},
      {"displayName", "标题音乐"},
  });
  legacy_v10["project"]["startScreen"] = {
      {"backgroundAssetId", "asset-image-1"},
      {"musicAssetId", "asset-audio-1"},
  };

  const auto migrated_v10 =
      vnengine::backend::project_file_from_json(legacy_v10);
  CHECK(migrated_v10.project.start_screen.title == "读取的项目");
  Json expected_migration = legacy_v10;
  expected_migration["project"]["startScreen"]["title"] = "读取的项目";
  expected_migration["project"]["startScreen"]["eyebrow"] =
      "A VN ENGINE STORY";
  expected_migration["project"]["cgGallery"] =
      migrated_v15_document().at("project").at("cgGallery");
  expected_migration = with_v21_image_scale(std::move(expected_migration));
  CHECK(vnengine::backend::project_file_to_json(migrated_v10) ==
        expected_migration);

  Json malformed = legacy_v10;
  malformed["project"]["startScreen"]["title"] = "v10 不允许该字段";
  expect_file_error(malformed, Kind::invalid_document);

  malformed = migrated_v19_document();
  malformed["project"]["startScreen"]["eyebrow"] =
      "v19 不允许该字段";
  expect_file_error(malformed, Kind::invalid_document);

  Json source = expected_migration;
  source["project"]["startScreen"]["title"] = "自定义标题";
  source["project"]["startScreen"]["eyebrow"] = "CUSTOM STORY";

  const auto parsed = vnengine::backend::project_file_from_json(source);
  CHECK(parsed.project.start_screen.title == "自定义标题");
  CHECK(parsed.project.start_screen.eyebrow == "CUSTOM STORY");
  CHECK(parsed.project.start_screen.background_asset_id == "asset-image-1");
  CHECK(parsed.project.start_screen.music_asset_id == "asset-audio-1");
  CHECK(vnengine::backend::project_file_to_json(parsed) == source);
  CHECK(vnengine::backend::project_to_json(parsed.project)
            .at("startScreen") == source.at("project").at("startScreen"));

  malformed = migrated_v9_document();
  malformed["project"]["startScreen"] = source["project"]["startScreen"];
  expect_file_error(malformed, Kind::invalid_document);

  malformed = source;
  malformed["project"].erase("startScreen");
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["startScreen"] = nullptr;
  expect_file_error(malformed, Kind::invalid_document);
  for (const std::string& missing :
       {"title", "eyebrow", "backgroundAssetId", "musicAssetId"}) {
    malformed = source;
    malformed["project"]["startScreen"].erase(missing);
    expect_file_error(malformed, Kind::invalid_document);
  }
  malformed = source;
  malformed["project"]["startScreen"]["unexpected"] = true;
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["startScreen"]["title"] = nullptr;
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["startScreen"]["title"] = "  ";
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["startScreen"]["title"] = " 标题 ";
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["startScreen"]["eyebrow"] = " PADDED ";
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["startScreen"]["eyebrow"] =
      std::string(vnengine::kStartScreenEyebrowMaxBytes + 1U, 'a');
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["startScreen"]["eyebrow"] =
      std::string{"bad\0copy", 8};
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["startScreen"]["backgroundAssetId"] = 7;
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["startScreen"]["musicAssetId"] = Json::array();
  expect_file_error(malformed, Kind::invalid_document);

  const std::vector<std::pair<std::string, Json>> invalid_references{
      {"backgroundAssetId", ""},
      {"backgroundAssetId", "missing"},
      {"backgroundAssetId", "asset-video-1"},
      {"musicAssetId", ""},
      {"musicAssetId", "missing"},
      {"musicAssetId", "asset-image-1"},
  };
  for (const auto& [field, value] : invalid_references) {
    malformed = source;
    malformed["project"]["startScreen"][field] = value;
    expect_file_error(malformed, Kind::invalid_document);
  }
}

void round_trips_v14_story_extensions_strictly() {
  using Kind = vnengine::backend::ProjectFileErrorKind;

  Json legacy_v12 = migrated_v12_document();
  legacy_v12["project"]["scenes"][0]["nodes"].push_back({
      {"id", "story-extension-1"},
      {"type", "storyExtension"},
  });
  const auto migrated_from_v12 =
      vnengine::backend::project_file_from_json(legacy_v12);
  Json source = vnengine::backend::project_file_to_json(migrated_from_v12);
  CHECK(source == migrated_to_v21(legacy_v12));
  source["project"]["scenes"][0]["nodes"].push_back({
      {"id", "custom-character"},
      {"type", "character"},
      {"mode", "show"},
      {"assetId", "asset-image-1"},
      {"slot", "left"},
      {"layer", 2},
      {"scalePercent", 100},
      {"position", {{"x", 32.5}, {"y", 86.0}}},
      {"effect", nullptr},
  });

  const auto parsed = vnengine::backend::project_file_from_json(source);
  const auto& extension = std::get<vnengine::StoryExtensionNode>(
      parsed.project.scenes[0].nodes[1]);
  CHECK(extension.id == "story-extension-1");
  const auto& character = std::get<vnengine::CharacterNode>(
      parsed.project.scenes[0].nodes[2]);
  CHECK(character.position ==
        (vnengine::CharacterPosition{.x = 32.5, .y = 86.0}));
  CHECK(vnengine::backend::project_file_to_json(parsed) == source);
  CHECK(vnengine::backend::project_to_json(parsed.project)
            .at("scenes")[0]
            .at("nodes")[1] == Json({
                {"id", "story-extension-1"},
                {"type", "storyExtension"},
            }));

  std::vector<Json> legacy_documents{
      valid_document(),
      migrated_v2_document(),
      migrated_v3_document(),
      migrated_v4_document(),
      migrated_v5_document(),
      migrated_v6_document(),
      migrated_v7_document(),
      migrated_v8_document(),
      migrated_v9_document(),
      migrated_v10_document(),
      migrated_v11_document(),
  };
  for (std::size_t index = 0; index < legacy_documents.size(); ++index) {
    Json& legacy = legacy_documents[index];
    legacy["project"]["scenes"][0]["nodes"].push_back({
        {"id", "legacy-story-extension"},
        {"type", "storyExtension"},
    });
    expect_file_error(
        legacy,
        index < 2 ? Kind::invalid_document : Kind::unsupported_format);
  }

  for (const std::string& missing : {"id", "type"}) {
    Json malformed = source;
    malformed["project"]["scenes"][0]["nodes"][1].erase(missing);
    expect_file_error(malformed, Kind::invalid_document);
  }
  Json malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["number"] = 1;
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["id"] = "";
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][2].erase("position");
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][2]["position"]["x"] = 101;
  expect_file_error(malformed, Kind::invalid_document);
}

void migrates_v14_and_v15_cg_pages_to_v16_strictly() {
  using Kind = vnengine::backend::ProjectFileErrorKind;

  Json legacy = migrated_v14_document();
  Json legacy_ids = Json::array({"asset-image-1"});
  for (int index = 2; index <= 10; ++index) {
    const std::string asset_id = "asset-image-" + std::to_string(index);
    legacy["assets"].push_back({
        {"id", asset_id},
        {"type", "image"},
        {"relativePath",
         "assets/images/gallery-" + std::to_string(index) + ".png"},
        {"displayName", "CG " + std::to_string(index)},
    });
    legacy_ids.push_back(asset_id);
  }
  legacy["project"]["cgGallery"]["imageAssetIds"] = legacy_ids;

  const auto migrated = vnengine::backend::project_file_from_json(legacy);
  CHECK(migrated.project.cg_gallery.pages.size() == 2);
  CHECK(migrated.project.cg_gallery.pages[0].image_asset_ids[0] ==
        "asset-image-1");
  CHECK(migrated.project.cg_gallery.pages[0].image_asset_ids[1] ==
        "asset-image-2");
  CHECK(migrated.project.cg_gallery.pages[0].image_asset_ids[8] ==
        "asset-image-9");
  CHECK(migrated.project.cg_gallery.pages[1].image_asset_ids[0] ==
        "asset-image-10");
  CHECK(!migrated.project.cg_gallery.pages[1]
             .image_asset_ids[1]
             .has_value());
  CHECK(vnengine::backend::project_file_to_json(migrated) ==
        with_v21_image_scale(with_v20_start_screen_eyebrow(
            with_v19_character_modes(with_v18_character_effects(
                with_v17_cg_display(
                    with_v16_logic(with_v15_cg_pages(legacy))))))));

  Json source = with_v15_cg_pages(legacy);
  source["project"]["cgGallery"]["pages"] = Json::array({
      cg_page_json({{0, "asset-image-2"}, {3, "asset-image-1"}}),
      cg_page_json(),
  });
  const auto parsed = vnengine::backend::project_file_from_json(source);
  CHECK(parsed.project.cg_gallery.pages.size() == 2);
  CHECK(parsed.project.cg_gallery.pages[0].image_asset_ids[0] ==
        "asset-image-2");
  CHECK(!parsed.project.cg_gallery.pages[0]
             .image_asset_ids[1]
             .has_value());
  CHECK(parsed.project.cg_gallery.pages[0].image_asset_ids[3] ==
        "asset-image-1");
  CHECK(vnengine::backend::project_file_to_json(parsed) ==
        with_v21_image_scale(with_v20_start_screen_eyebrow(
            with_v19_character_modes(with_v18_character_effects(
                with_v17_cg_display(with_v16_logic(source)))))));
  CHECK(vnengine::backend::project_to_json(parsed.project).at("cgGallery") ==
        source.at("project").at("cgGallery"));

  Json malformed = source;
  malformed["project"].erase("cgGallery");
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["fileVersion"] = 14;
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["cgGallery"] = nullptr;
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["cgGallery"].erase("pages");
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["cgGallery"]["unexpected"] = true;
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["cgGallery"]["pages"] = Json::array();
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["cgGallery"]["pages"] = "not-pages";
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["cgGallery"]["pages"][0]["unexpected"] = true;
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  Json& short_page =
      malformed["project"]["cgGallery"]["pages"][0]["imageAssetIds"];
  short_page.erase(short_page.size() - 1U);
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["cgGallery"]["pages"][0]["imageAssetIds"][1] = 7;
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["cgGallery"]["pages"][1]["imageAssetIds"][0] =
      "asset-image-2";
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["cgGallery"]["pages"][0]["imageAssetIds"][0] =
      "missing-image";
  expect_file_error(malformed, Kind::invalid_document);
  malformed = source;
  malformed["project"]["cgGallery"]["pages"][0]["imageAssetIds"][0] =
      "asset-video-1";
  expect_file_error(malformed, Kind::invalid_document);

  Json malformed_legacy = legacy;
  malformed_legacy["project"]["cgGallery"]["imageAssetIds"] =
      Json::array({"asset-image-1", 7});
  expect_file_error(malformed_legacy, Kind::invalid_document);
}

void migrates_and_round_trips_v18_character_effects_strictly() {
  using Kind = vnengine::backend::ProjectFileErrorKind;

  Json source = migrated_v18_document();
  const std::vector<Json> effects{
      {{"type", "shake"}, {"durationMs", 100}, {"intensity", "subtle"}},
      {{"type", "jump"}, {"durationMs", 250}, {"intensity", "normal"}},
      {{"type", "breathe"}, {"durationMs", 800}, {"intensity", "strong"}},
      {{"type", "flash"}, {"durationMs", 450}, {"intensity", "normal"}},
      {{"type", "fadeIn"}, {"durationMs", 1000}},
      {{"type", "fadeOut"}, {"durationMs", 10000}},
      {{"type", "slideIn"},
       {"durationMs", 600},
       {"intensity", "strong"},
       {"direction", "left"}},
  };
  for (std::size_t index = 0; index < effects.size(); ++index) {
    source["project"]["scenes"][0]["nodes"].push_back({
        {"id", "character-effect-" + std::to_string(index)},
        {"type", "character"},
        {"assetId", "asset-image-1"},
        {"slot", "center"},
        {"layer", 1},
        {"position", nullptr},
        {"effect", effects[index]},
    });
  }
  const auto parsed = vnengine::backend::project_file_from_json(source);
  CHECK(vnengine::backend::project_file_to_json(parsed) ==
        with_v21_image_scale(with_v20_start_screen_eyebrow(
            with_v19_character_modes(source))));
  CHECK(std::get<vnengine::CharacterNode>(
            parsed.project.scenes[0].nodes[1])
            .mode == vnengine::CharacterNodeMode::show);
  CHECK(std::get<vnengine::CharacterNode>(
            parsed.project.scenes[0].nodes[1])
            .effect->type == vnengine::CharacterEffectType::shake);
  CHECK(std::get<vnengine::CharacterNode>(
            parsed.project.scenes[0].nodes[7])
            .effect->direction == vnengine::CharacterEffectDirection::left);

  Json legacy = migrated_v17_document();
  legacy["project"]["scenes"][0]["nodes"].push_back({
      {"id", "legacy-character"},
      {"type", "character"},
      {"assetId", "asset-image-1"},
      {"slot", "right"},
      {"layer", 2},
      {"position", nullptr},
  });
  const auto migrated = vnengine::backend::project_file_from_json(legacy);
  CHECK(!std::get<vnengine::CharacterNode>(
             migrated.project.scenes[0].nodes[1])
             .effect.has_value());
  CHECK(vnengine::backend::project_file_to_json(migrated)
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("effect")
            .is_null());

  // An effect field forged into any pre-v18 shape is not migration input.
  Json forged_legacy = legacy;
  forged_legacy["project"]["scenes"][0]["nodes"][1]["effect"] =
      effects[0];
  expect_file_error(forged_legacy, Kind::invalid_document);

  Json base = source;
  base["project"]["scenes"][0]["nodes"] = Json::array({
      source["project"]["scenes"][0]["nodes"][1],
  });
  std::vector<Json> malformed_effects{
      {{"type", "shake"}, {"durationMs", 500}},
      {{"type", "shake"},
       {"durationMs", 500},
       {"intensity", "normal"},
       {"direction", "left"}},
      {{"type", "fadeIn"}, {"durationMs", 500}, {"intensity", "normal"}},
      {{"type", "slideIn"},
       {"durationMs", 500},
       {"intensity", "normal"}},
      {{"type", "slideIn"},
       {"durationMs", 500},
       {"intensity", "normal"},
       {"direction", "diagonal"}},
      {{"type", "jump"}, {"durationMs", 99}, {"intensity", "normal"}},
      {{"type", "flash"},
       {"durationMs", 10001},
       {"intensity", "normal"}},
      {{"type", "breathe"},
       {"durationMs", 500.5},
       {"intensity", "normal"}},
      {{"type", "unknown"}, {"durationMs", 500}},
  };
  for (const Json& effect : malformed_effects) {
    Json malformed = base;
    malformed["project"]["scenes"][0]["nodes"][0]["effect"] = effect;
    expect_file_error(malformed, Kind::invalid_document);
  }
  Json cleared = base;
  cleared["project"]["scenes"][0]["nodes"][0]["assetId"] = nullptr;
  expect_file_error(cleared, Kind::invalid_document);
}

void migrates_legacy_character_nulls_and_round_trips_v19_modes_strictly() {
  using Kind = vnengine::backend::ProjectFileErrorKind;

  Json legacy = migrated_v18_document();
  Json& legacy_nodes = legacy["project"]["scenes"][0]["nodes"];
  legacy_nodes.push_back({
      {"id", "legacy-character-show"},
      {"type", "character"},
      {"assetId", "asset-image-1"},
      {"slot", "left"},
      {"layer", 2},
      {"position", {{"x", 25.0}, {"y", 90.0}}},
      {"effect", nullptr},
  });
  // v13-v18 allowed presentation metadata on an assetId=null clear command.
  // v19 migration drops that obsolete position instead of rejecting the file.
  legacy_nodes.push_back({
      {"id", "legacy-character-clear"},
      {"type", "character"},
      {"assetId", nullptr},
      {"slot", "right"},
      {"layer", 4},
      {"position", {{"x", 75.0}, {"y", 80.0}}},
      {"effect", nullptr},
  });

  const auto migrated = vnengine::backend::project_file_from_json(legacy);
  const auto& show = std::get<vnengine::CharacterNode>(
      migrated.project.scenes[0].nodes[1]);
  const auto& clear = std::get<vnengine::CharacterNode>(
      migrated.project.scenes[0].nodes[2]);
  CHECK(show.mode == vnengine::CharacterNodeMode::show);
  CHECK(show.asset_id == "asset-image-1");
  CHECK(clear.mode == vnengine::CharacterNodeMode::clear);
  CHECK(!clear.asset_id.has_value());
  CHECK(!clear.position.has_value());

  Json v19 = vnengine::backend::project_file_to_json(migrated);
  CHECK(v19.at("fileVersion") == 21);
  CHECK(v19["project"]["scenes"][0]["nodes"][1]["mode"] == "show");
  CHECK(v19["project"]["scenes"][0]["nodes"][2]["mode"] == "clear");
  CHECK(v19["project"]["scenes"][0]["nodes"][2]["position"].is_null());

  v19["project"]["scenes"][0]["nodes"].push_back({
      {"id", "character-placeholder"},
      {"type", "character"},
      {"mode", "show"},
      {"assetId", nullptr},
      {"slot", "center"},
      {"layer", 1},
      {"scalePercent", 150},
      {"position", nullptr},
      {"effect", nullptr},
  });
  const auto placeholder_document =
      vnengine::backend::project_file_from_json(v19);
  const auto& placeholder = std::get<vnengine::CharacterNode>(
      placeholder_document.project.scenes[0].nodes[3]);
  CHECK(placeholder.mode == vnengine::CharacterNodeMode::show);
  CHECK(!placeholder.asset_id.has_value());
  CHECK(placeholder.scale_percent == 150);
  CHECK(vnengine::backend::project_file_to_json(placeholder_document) == v19);
  CHECK(vnengine::backend::project_to_json(placeholder_document.project)
            .at("scenes")[0]
            .at("nodes")[3]
            .at("mode") == "show");

  Json malformed = v19;
  malformed["project"]["scenes"][0]["nodes"][3].erase("mode");
  expect_file_error(malformed, Kind::invalid_document);
  malformed = v19;
  malformed["project"]["scenes"][0]["nodes"][3]["mode"] = "hide";
  expect_file_error(malformed, Kind::invalid_document);
  malformed = v19;
  malformed["project"]["scenes"][0]["nodes"][2]["assetId"] =
      "asset-image-1";
  expect_file_error(malformed, Kind::invalid_document);
  malformed = v19;
  malformed["project"]["scenes"][0]["nodes"][2]["position"] =
      {{"x", 50.0}, {"y", 50.0}};
  expect_file_error(malformed, Kind::invalid_document);
  malformed = v19;
  malformed["project"]["scenes"][0]["nodes"][3]["effect"] = {
      {"type", "fadeIn"}, {"durationMs", 500}};
  expect_file_error(malformed, Kind::invalid_document);

  Json forged_legacy = legacy;
  forged_legacy["project"]["scenes"][0]["nodes"][1]["mode"] = "show";
  expect_file_error(forged_legacy, Kind::invalid_document);
}

class TemporaryDirectory final {
 public:
  TemporaryDirectory() {
    const auto nonce = std::chrono::steady_clock::now()
                           .time_since_epoch()
                           .count();
    path_ = std::filesystem::temp_directory_path() /
        ("vn-engine-backend-tests-" + std::to_string(nonce));
    if (!std::filesystem::create_directory(path_)) {
      throw std::runtime_error("could not create temporary directory");
    }
  }

  ~TemporaryDirectory() {
    std::error_code ignored;
    std::filesystem::remove_all(path_, ignored);
  }

  TemporaryDirectory(const TemporaryDirectory&) = delete;
  TemporaryDirectory& operator=(const TemporaryDirectory&) = delete;

  std::filesystem::path write(
      const std::string& filename,
      const std::string& contents) const {
    const std::filesystem::path file_path = path_ / filename;
    std::ofstream output(file_path, std::ios::binary);
    output.write(
        contents.data(), static_cast<std::streamsize>(contents.size()));
    if (!output) {
      throw std::runtime_error("could not write temporary project file");
    }
    return file_path;
  }

  std::filesystem::path path(const std::string& filename) const {
    return path_ / filename;
  }

  const std::filesystem::path& root() const {
    return path_;
  }

 private:
  std::filesystem::path path_;
};

Json request(
    vnengine::backend::Backend& backend,
    const int id,
    const std::string& method,
    Json params = Json::object()) {
  return Json::parse(backend.process_line(Json{
      {"id", id},
      {"method", method},
      {"params", std::move(params)},
  }.dump()));
}

std::string read_file(const std::filesystem::path& path) {
  std::ifstream input(path, std::ios::binary);
  return std::string(
      std::istreambuf_iterator<char>(input),
      std::istreambuf_iterator<char>());
}

Json open_params(const std::filesystem::path& path) {
  return {{"contents", read_file(path)}};
}

void expect_session(
    const Json& response,
    const std::uint64_t revision,
    const std::optional<std::uint64_t> saved_revision,
    const bool is_dirty) {
  CHECK(response.at("ok") == true);
  const Json& result = response.at("result");
  CHECK(result.contains("assets"));
  CHECK(result.at("assets").is_array());
  for (const Json& asset : result.at("assets")) {
    CHECK(asset.is_object());
    CHECK(asset.size() == 3);
    CHECK(asset.contains("id"));
    CHECK(asset.contains("type"));
    CHECK(asset.contains("displayName"));
    CHECK(!asset.contains("relativePath"));
  }
  if (!result.at("project").is_null()) {
    const Json& project = result.at("project");
    CHECK(project.contains("startScreen"));
    CHECK(project.at("startScreen").is_object());
    CHECK(project.at("startScreen").size() == 4);
    CHECK(project.at("startScreen").contains("title"));
    CHECK(project.at("startScreen").at("title").is_string());
    CHECK(project.at("startScreen").contains("eyebrow"));
    CHECK(project.at("startScreen").at("eyebrow").is_string());
    CHECK(project.at("startScreen").contains("backgroundAssetId"));
    CHECK(project.at("startScreen").contains("musicAssetId"));
    CHECK(project.at("startScreen").at("backgroundAssetId").is_null() ||
          project.at("startScreen").at("backgroundAssetId").is_string());
    CHECK(project.at("startScreen").at("musicAssetId").is_null() ||
          project.at("startScreen").at("musicAssetId").is_string());
    for (const Json& scene : project.at("scenes")) {
      CHECK(scene.contains("backgroundAssetId"));
      CHECK(scene.at("backgroundAssetId").is_null() ||
            scene.at("backgroundAssetId").is_string());
    }
  }

  const Json& session = result.at("session");
  CHECK(session.at("revision") == revision);
  if (saved_revision.has_value()) {
    CHECK(session.at("savedRevision") == *saved_revision);
  } else {
    CHECK(session.at("savedRevision").is_null());
  }
  CHECK(session.at("isDirty") == is_dirty);
}

void updates_and_persists_cg_gallery_atomically() {
  TemporaryDirectory temporary;
  Json source_document = migrated_v16_document();
  source_document["assets"].push_back({
      {"id", "asset-image-2"},
      {"type", "image"},
      {"relativePath", "assets/images/ending.png"},
      {"displayName", "结局 CG"},
  });
  const std::filesystem::path source = temporary.write(
      "gallery-source.vn.json", source_document.dump(2));
  const std::filesystem::path target = temporary.path("project.vn.json");

  vnengine::backend::Backend backend;
  const Json opened = request(backend, 1, "project.open", open_params(source));
  expect_session(opened, 0, 0, false);
  CHECK(opened.at("result")
            .at("project")
            .at("cgGallery")
            .at("pages") ==
        Json::array({cg_page_json()}));

  const Json selected_pages = Json::array({
      cg_page_json({{0, "asset-image-2"}, {4, "asset-image-1"}}),
      cg_page_json(),
  });

  const Json updated = request(
      backend,
      2,
      "cgGallery.update",
      {{"pages", selected_pages}});
  expect_session(updated, 1, 0, true);
  CHECK(updated.at("result")
            .at("project")
            .at("cgGallery")
            .at("pages") == selected_pages);

  const Json unchanged = request(
      backend,
      3,
      "cgGallery.update",
      {{"pages", selected_pages}});
  expect_session(unchanged, 1, 0, true);

  const std::vector<std::pair<Json, std::string>> failures{
      {Json::array({cg_page_json({{0, "missing-image"}})}),
       "asset_not_found"},
      {Json::array({cg_page_json({{0, "asset-video-1"}})}),
       "asset_not_image"},
      {Json::array({
           cg_page_json({{0, "asset-image-1"}}),
           cg_page_json({{8, "asset-image-1"}}),
       }),
       "invalid_params"},
      {Json::array(), "invalid_params"},
  };
  int request_id = 4;
  for (const auto& [pages, error_code] : failures) {
    const Json failed = request(
        backend,
        request_id++,
        "cgGallery.update",
        {{"pages", pages}});
    CHECK(failed.at("ok") == false);
    CHECK(failed.at("error").at("code") == error_code);
    const Json current = request(backend, request_id++, "project.get");
    expect_session(current, 1, 0, true);
    CHECK(current.at("result")
              .at("project")
              .at("cgGallery")
              .at("pages") == selected_pages);
  }

  const Json unknown_param = request(
      backend,
      request_id++,
      "cgGallery.update",
      {{"pages", Json::array({cg_page_json()})}, {"unexpected", true}});
  CHECK(unknown_param.at("ok") == false);
  CHECK(unknown_param.at("error").at("code") == "invalid_params");

  const Json saved = request(
      backend,
      request_id,
      "project.save",
      {{"filePath", target.string()}});
  expect_session(saved, 1, 1, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 21);
  CHECK(persisted.at("project")
            .at("cgGallery")
            .at("pages") == selected_pages);
}

void imports_an_image_without_exposing_paths_or_autosaving_manifest() {
  TemporaryDirectory temporary;
  const std::filesystem::path project_file =
      temporary.path("project.vn.json");
  const std::filesystem::path source = temporary.write(
      "Alice Portrait.PNG", png_image_bytes());
  const std::string original_source = read_file(source);

  vnengine::backend::Backend backend;
  const Json created = request(
      backend, 1, "project.create", {{"name", "图片导入"}});
  expect_session(created, 0, std::nullopt, true);
  CHECK(created.at("result").at("assets").empty());

  const Json initially_saved = request(
      backend,
      2,
      "project.save",
      {{"filePath", project_file.string()}});
  expect_session(initially_saved, 0, 0, false);
  CHECK(Json::parse(read_file(project_file)).at("assets").empty());

  const Json imported = request(
      backend,
      3,
      "asset.import",
      {
          {"kind", "image"},
          {"sourceFilePath", source.string()},
          {"projectFilePath", project_file.string()},
      });
  expect_session(imported, 1, 0, true);
  const Json& result = imported.at("result");
  CHECK(result.contains("assetId"));
  const std::string asset_id = result.at("assetId").get<std::string>();
  CHECK(!asset_id.empty());
  CHECK(result.at("assets").size() == 1);
  CHECK(result.at("assets")[0] == Json({
      {"id", asset_id},
      {"type", "image"},
      {"displayName", "Alice Portrait"},
  }));
  CHECK(imported.dump().find(source.string()) == std::string::npos);
  CHECK(imported.dump().find(project_file.string()) == std::string::npos);

  const std::filesystem::path imported_file = temporary.root() /
      "assets" / "images" / (asset_id + ".png");
  CHECK(std::filesystem::is_regular_file(imported_file));
  CHECK(read_file(imported_file) == original_source);
  CHECK(read_file(source) == original_source);

  // Import only copies the binary and mutates the in-memory manifest. The
  // existing project file remains unchanged until the ordinary save command.
  CHECK(Json::parse(read_file(project_file)).at("assets").empty());

  const Json saved = request(
      backend,
      4,
      "project.save",
      {{"filePath", project_file.string()}});
  expect_session(saved, 1, 1, false);
  const Json persisted = Json::parse(read_file(project_file));
  CHECK(persisted.at("assets").size() == 1);
  CHECK(persisted.at("assets")[0] == Json({
      {"id", asset_id},
      {"type", "image"},
      {"relativePath", "assets/images/" + asset_id + ".png"},
      {"displayName", "Alice Portrait"},
  }));
}

void imports_a_video_transactionally_without_exposing_paths() {
  TemporaryDirectory temporary;
  const std::filesystem::path project_file =
      temporary.path("project.vn.json");
  const std::filesystem::path source = temporary.write(
      "Opening Movie.MP4", mp4_video_bytes());

  vnengine::backend::Backend backend;
  static_cast<void>(request(
      backend, 1, "project.create", {{"name", "视频导入"}}));
  const Json initially_saved = request(
      backend, 2, "project.save", {{"filePath", project_file.string()}});
  expect_session(initially_saved, 0, 0, false);

  const Json imported = request(
      backend,
      3,
      "asset.import",
      {
          {"sourceFilePath", source.string()},
          {"projectFilePath", project_file.string()},
          {"kind", "video"},
      });
  expect_session(imported, 1, 0, true);
  const Json& result = imported.at("result");
  const std::string asset_id = result.at("assetId").get<std::string>();
  CHECK(result.at("assets").size() == 1);
  CHECK(result.at("assets")[0] == Json({
      {"id", asset_id},
      {"type", "video"},
      {"displayName", "Opening Movie"},
  }));
  CHECK(imported.dump().find(source.string()) == std::string::npos);
  CHECK(imported.dump().find(project_file.string()) == std::string::npos);

  const std::filesystem::path imported_file = temporary.root() /
      "assets" / "videos" / (asset_id + ".mp4");
  CHECK(std::filesystem::is_regular_file(imported_file));
  CHECK(read_file(imported_file) == mp4_video_bytes());
  CHECK(Json::parse(read_file(project_file)).at("assets").empty());

  const Json saved = request(
      backend, 4, "project.save", {{"filePath", project_file.string()}});
  expect_session(saved, 1, 1, false);
  CHECK(Json::parse(read_file(project_file)).at("assets")[0] == Json({
      {"id", asset_id},
      {"type", "video"},
      {"relativePath", "assets/videos/" + asset_id + ".mp4"},
      {"displayName", "Opening Movie"},
  }));

  const Json invalid_kind = request(
      backend,
      5,
      "asset.import",
      {
          {"sourceFilePath", source.string()},
          {"projectFilePath", project_file.string()},
          {"kind", "executable"},
      });
  CHECK(invalid_kind.at("ok") == false);
  CHECK(invalid_kind.at("error").at("code") == "invalid_params");
  const Json unchanged = request(backend, 6, "project.get");
  expect_session(unchanged, 1, 1, false);
}

void imports_audio_transactionally_without_exposing_paths() {
  TemporaryDirectory temporary;
  const std::filesystem::path project_file =
      temporary.path("project.vn.json");
  const std::filesystem::path source = temporary.write(
      "Alice Greeting.MP3", mp3_audio_bytes());

  vnengine::backend::Backend backend;
  static_cast<void>(request(
      backend, 1, "project.create", {{"name", "音频导入"}}));
  const Json initially_saved = request(
      backend, 2, "project.save", {{"filePath", project_file.string()}});
  expect_session(initially_saved, 0, 0, false);

  const Json imported = request(
      backend,
      3,
      "asset.import",
      {
          {"sourceFilePath", source.string()},
          {"projectFilePath", project_file.string()},
          {"kind", "audio"},
      });
  expect_session(imported, 1, 0, true);
  const std::string asset_id =
      imported.at("result").at("assetId").get<std::string>();
  CHECK(imported.at("result").at("assets")[0] == Json({
      {"id", asset_id},
      {"type", "audio"},
      {"displayName", "Alice Greeting"},
  }));
  CHECK(imported.dump().find(source.string()) == std::string::npos);
  CHECK(imported.dump().find(project_file.string()) == std::string::npos);

  const std::filesystem::path imported_file = temporary.root() /
      "assets" / "audio" / (asset_id + ".mp3");
  CHECK(std::filesystem::is_regular_file(imported_file));
  CHECK(read_file(imported_file) == mp3_audio_bytes());
  CHECK(Json::parse(read_file(project_file)).at("assets").empty());

  const Json saved = request(
      backend, 4, "project.save", {{"filePath", project_file.string()}});
  expect_session(saved, 1, 1, false);
  CHECK(Json::parse(read_file(project_file)).at("assets")[0] == Json({
      {"id", asset_id},
      {"type", "audio"},
      {"relativePath", "assets/audio/" + asset_id + ".mp3"},
      {"displayName", "Alice Greeting"},
  }));
}

void rejects_unsafe_image_sources_without_mutating_document() {
  TemporaryDirectory temporary;
  const std::filesystem::path project_file =
      temporary.path("project.vn.json");
  const std::filesystem::path valid_source = temporary.write(
      "valid.png", png_image_bytes());
  const std::filesystem::path mismatched = temporary.write(
      "mismatch.png", jpeg_image_bytes());
  const std::filesystem::path unsupported = temporary.write(
      "unsupported.gif", png_image_bytes());
  const std::filesystem::path empty = temporary.write("empty.webp", "");
  const std::filesystem::path directory = temporary.path("directory.png");
  CHECK(std::filesystem::create_directory(directory));
  const std::filesystem::path oversized = temporary.write(
      "oversized.png", png_image_bytes());
  std::filesystem::resize_file(
      oversized,
      vnengine::backend::kMaximumImportedImageBytes + 1U);

  std::optional<std::filesystem::path> symlink;
  const std::filesystem::path symlink_path = temporary.path("linked.png");
  std::error_code symlink_error;
  std::filesystem::create_symlink(
      valid_source, symlink_path, symlink_error);
  if (!symlink_error) {
    symlink = symlink_path;
  }

  vnengine::backend::Backend no_project;
  const Json missing_project = request(
      no_project,
      1,
      "asset.import",
      {
          {"kind", "image"},
          {"sourceFilePath", valid_source.string()},
          {"projectFilePath", project_file.string()},
      });
  CHECK(missing_project.at("ok") == false);
  CHECK(missing_project.at("error").at("code") == "project_not_created");

  vnengine::backend::Backend backend;
  static_cast<void>(request(
      backend, 1, "project.create", {{"name", "失败保持"}}));
  const Json clean = request(
      backend,
      2,
      "project.save",
      {{"filePath", project_file.string()}});
  expect_session(clean, 0, 0, false);

  std::vector<std::filesystem::path> invalid_sources{
      mismatched, unsupported, empty, directory, oversized};
  if (symlink.has_value()) {
    invalid_sources.push_back(*symlink);
  }

  int request_id = 3;
  for (const std::filesystem::path& invalid_source : invalid_sources) {
    const Json failed = request(
        backend,
        request_id++,
        "asset.import",
        {
            {"kind", "image"},
            {"sourceFilePath", invalid_source.string()},
            {"projectFilePath", project_file.string()},
        });
    CHECK(failed.at("ok") == false);
    CHECK(failed.at("error").at("code") == "asset_import_failed");

    const Json current = request(backend, request_id++, "project.get");
    expect_session(current, 0, 0, false);
    CHECK(current.at("result").at("assets").empty());
  }

  const Json invalid_project_path = request(
      backend,
      request_id++,
      "asset.import",
      {
          {"kind", "image"},
          {"sourceFilePath", valid_source.string()},
          {"projectFilePath", "project.vn.json"},
      });
  CHECK(invalid_project_path.at("ok") == false);
  CHECK(invalid_project_path.at("error").at("code") == "invalid_params");

  const Json final_state = request(backend, request_id, "project.get");
  expect_session(final_state, 0, 0, false);
  CHECK(final_state.at("result").at("assets").empty());
  CHECK(Json::parse(read_file(project_file)).at("assets").empty());

  const std::filesystem::path assets = temporary.root() / "assets";
  if (std::filesystem::exists(assets)) {
    for (const auto& entry :
         std::filesystem::recursive_directory_iterator(assets)) {
      CHECK(entry.path().filename().string().find(".tmp-") ==
            std::string::npos);
      CHECK(!entry.is_regular_file());
    }
  }
}

void sets_clears_and_persists_scene_backgrounds_atomically() {
  TemporaryDirectory temporary;
  const std::filesystem::path source = temporary.write(
      "background-source.vn.json", valid_document().dump(2));
  const std::filesystem::path target =
      temporary.path("project.vn.json");

  vnengine::backend::Backend backend;
  const Json opened = request(backend, 1, "project.open", open_params(source));
  expect_session(opened, 0, 0, false);
  const Json& opened_scene =
      opened.at("result").at("project").at("scenes")[0];
  CHECK(opened_scene.at("backgroundAssetId").is_null());
  CHECK(opened_scene.at("backgroundScalePercent") == 100);

  // project.get uses the same public projection as every mutation response.
  const Json initial_snapshot = request(backend, 2, "project.get");
  expect_session(initial_snapshot, 0, 0, false);
  CHECK(initial_snapshot.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundAssetId")
            .is_null());
  CHECK(initial_snapshot.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundScalePercent") == 100);

  const Json assigned = request(
      backend,
      3,
      "scene.setBackground",
      {{"sceneId", "scene-1"},
       {"assetId", "asset-image-1"},
       {"scalePercent", 80}});
  expect_session(assigned, 1, 0, true);
  CHECK(assigned.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundAssetId") == "asset-image-1");
  CHECK(assigned.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundScalePercent") == 80);

  // Assigning the authoritative value again is a successful no-op.
  const Json same_assignment = request(
      backend,
      4,
      "scene.setBackground",
      {{"sceneId", "scene-1"},
       {"assetId", "asset-image-1"},
       {"scalePercent", 80}});
  expect_session(same_assignment, 1, 0, true);

  int request_id = 5;
  const std::vector<std::pair<Json, std::string>> invalid_changes{
      {{{"sceneId", "missing-scene"},
        {"assetId", "asset-image-1"},
        {"scalePercent", 80}},
       "scene_not_found"},
      {{{"sceneId", "scene-1"},
        {"assetId", "missing-asset"},
        {"scalePercent", 80}},
       "asset_not_found"},
      {{{"sceneId", "scene-1"},
        {"assetId", "asset-video-1"},
        {"scalePercent", 80}},
       "asset_not_image"},
      {{{"sceneId", "scene-1"}}, "invalid_params"},
      {{{"sceneId", "scene-1"}, {"assetId", 7}, {"scalePercent", 80}},
       "invalid_params"},
      {{{"sceneId", "scene-1"}, {"assetId", "asset-image-1"}},
       "invalid_params"},
      {{{"sceneId", "scene-1"},
        {"assetId", "asset-image-1"},
        {"scalePercent", 9}},
       "invalid_params"},
      {{{"sceneId", "scene-1"},
        {"assetId", "asset-image-1"},
        {"scalePercent", 301}},
       "invalid_params"},
      {{{"sceneId", "scene-1"}, {"assetId", nullptr}, {"scalePercent", 80}},
       "invalid_params"},
  };
  for (const auto& [params, expected_code] : invalid_changes) {
    const Json failed = request(
        backend, request_id++, "scene.setBackground", params);
    CHECK(failed.at("ok") == false);
    CHECK(failed.at("error").at("code") == expected_code);

    const Json unchanged = request(backend, request_id++, "project.get");
    expect_session(unchanged, 1, 0, true);
    CHECK(unchanged.at("result")
              .at("project")
              .at("scenes")[0]
              .at("backgroundAssetId") == "asset-image-1");
    CHECK(unchanged.at("result")
              .at("project")
              .at("scenes")[0]
              .at("backgroundScalePercent") == 80);
  }

  const Json cleared = request(
      backend,
      request_id++,
      "scene.setBackground",
      {{"sceneId", "scene-1"},
       {"assetId", nullptr},
       {"scalePercent", 100}});
  expect_session(cleared, 2, 0, true);
  CHECK(cleared.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundAssetId")
            .is_null());
  CHECK(cleared.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundScalePercent") == 100);

  const Json same_clear = request(
      backend,
      request_id++,
      "scene.setBackground",
      {{"sceneId", "scene-1"},
       {"assetId", nullptr},
       {"scalePercent", 100}});
  expect_session(same_clear, 2, 0, true);

  const Json reassigned = request(
      backend,
      request_id++,
      "scene.setBackground",
      {{"sceneId", "scene-1"},
       {"assetId", "asset-image-1"},
       {"scalePercent", 125}});
  expect_session(reassigned, 3, 0, true);

  const Json saved = request(
      backend,
      request_id++,
      "project.save",
      {{"filePath", target.string()}});
  expect_session(saved, 3, 3, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 21);
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("visuals")
            .at("backgroundAssetId") == "asset-image-1");
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("visuals")
            .at("backgroundScalePercent") == 125);

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend,
      1,
      "project.open",
      open_params(target));
  expect_session(reopened, 0, 0, false);
  CHECK(reopened.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundAssetId") == "asset-image-1");
  CHECK(reopened.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundScalePercent") == 125);
}

void updates_and_persists_start_screen_atomically() {
  TemporaryDirectory temporary;
  Json source_document = migrated_v10_document();
  source_document["assets"].push_back({
      {"id", "asset-audio-1"},
      {"type", "audio"},
      {"relativePath", "assets/audio/title.mp3"},
      {"displayName", "标题音乐"},
  });
  const std::filesystem::path source = temporary.write(
      "start-screen-source.vn.json", source_document.dump(2));
  const std::filesystem::path target = temporary.path("project.vn.json");

  vnengine::backend::Backend backend;
  const Json opened = request(backend, 1, "project.open", open_params(source));
  expect_session(opened, 0, 0, false);
  CHECK(opened.at("result")
            .at("project")
            .at("startScreen") == Json({
                {"title", "读取的项目"},
                {"eyebrow", "A VN ENGINE STORY"},
                {"backgroundAssetId", nullptr},
                {"musicAssetId", nullptr},
            }));

  const Json assigned = request(
      backend,
      2,
      "startScreen.update",
      {{"title", "  自定义标题  "},
       {"eyebrow", "  CUSTOM STORY  "},
       {"backgroundAssetId", "asset-image-1"},
       {"musicAssetId", "asset-audio-1"}});
  expect_session(assigned, 1, 0, true);
  const Json expected_screen{
      {"title", "自定义标题"},
      {"eyebrow", "CUSTOM STORY"},
      {"backgroundAssetId", "asset-image-1"},
      {"musicAssetId", "asset-audio-1"},
  };
  CHECK(assigned.at("result").at("project").at("startScreen") ==
        expected_screen);

  const Json same_assignment = request(
      backend,
      3,
      "startScreen.update",
      {{"title", "自定义标题"},
       {"eyebrow", "CUSTOM STORY"},
       {"backgroundAssetId", "asset-image-1"},
       {"musicAssetId", "asset-audio-1"}});
  expect_session(same_assignment, 1, 0, true);

  const std::vector<std::pair<Json, std::string>> invalid_changes{
      {{{"musicAssetId", "asset-audio-1"}}, "invalid_params"},
      {{{"backgroundAssetId", "asset-image-1"}}, "invalid_params"},
      {{{"title", "自定义标题"},
        {"eyebrow", "CUSTOM STORY"},
        {"backgroundAssetId", "asset-image-1"},
        {"musicAssetId", "asset-audio-1"},
        {"unexpected", true}},
       "invalid_params"},
      {{{"title", 7},
        {"eyebrow", "CUSTOM STORY"},
        {"backgroundAssetId", nullptr},
        {"musicAssetId", nullptr}},
       "invalid_params"},
      {{{"title", "自定义标题"},
        {"eyebrow", "CUSTOM STORY"},
        {"backgroundAssetId", 7},
        {"musicAssetId", nullptr}},
       "invalid_params"},
      {{{"title", "自定义标题"},
        {"eyebrow", "CUSTOM STORY"},
        {"backgroundAssetId", nullptr},
        {"musicAssetId", false}},
       "invalid_params"},
      {{{"title", "   "},
        {"eyebrow", "CUSTOM STORY"},
        {"backgroundAssetId", nullptr},
        {"musicAssetId", nullptr}},
       "start_screen_title_required"},
      {{{"title", "不应提交"},
        {"eyebrow", std::string(vnengine::kStartScreenEyebrowMaxBytes + 1U, 'a')},
        {"backgroundAssetId", nullptr},
        {"musicAssetId", nullptr}},
       "start_screen_eyebrow_invalid"},
      {{{"title", "不应提交"},
        {"eyebrow", std::string{"bad\0copy", 8}},
        {"backgroundAssetId", nullptr},
        {"musicAssetId", nullptr}},
       "start_screen_eyebrow_invalid"},
      {{{"title", "不应提交"},
        {"eyebrow", "CUSTOM STORY"},
        {"backgroundAssetId", "missing"},
        {"musicAssetId", "asset-audio-1"}},
       "asset_not_found"},
      {{{"title", "不应提交"},
        {"eyebrow", "CUSTOM STORY"},
        {"backgroundAssetId", "asset-video-1"},
        {"musicAssetId", "asset-audio-1"}},
       "asset_not_image"},
      {{{"title", "不应提交"},
        {"eyebrow", "CUSTOM STORY"},
        {"backgroundAssetId", nullptr},
        {"musicAssetId", "missing"}},
       "asset_not_found"},
      {{{"title", "不应提交"},
        {"eyebrow", "CUSTOM STORY"},
        {"backgroundAssetId", nullptr},
        {"musicAssetId", "asset-image-1"}},
       "asset_not_audio"},
  };
  int request_id = 4;
  for (const auto& [params, expected_code] : invalid_changes) {
    const Json failed = request(
        backend, request_id++, "startScreen.update", params);
    CHECK(failed.at("ok") == false);
    CHECK(failed.at("error").at("code") == expected_code);
    const Json unchanged = request(backend, request_id++, "project.get");
    expect_session(unchanged, 1, 0, true);
    CHECK(unchanged.at("result").at("project").at("startScreen") ==
          expected_screen);
  }

  const Json cleared = request(
      backend,
      request_id++,
      "startScreen.update",
      {{"title", "自定义标题"},
       {"eyebrow", ""},
       {"backgroundAssetId", nullptr},
       {"musicAssetId", nullptr}});
  expect_session(cleared, 2, 0, true);
  const Json same_clear = request(
      backend,
      request_id++,
      "startScreen.update",
      {{"title", "自定义标题"},
       {"eyebrow", ""},
       {"backgroundAssetId", nullptr},
       {"musicAssetId", nullptr}});
  expect_session(same_clear, 2, 0, true);

  const Json reassigned = request(
      backend,
      request_id++,
      "startScreen.update",
      {{"title", "自定义标题"},
       {"eyebrow", "CUSTOM STORY"},
       {"backgroundAssetId", "asset-image-1"},
       {"musicAssetId", "asset-audio-1"}});
  expect_session(reassigned, 3, 0, true);
  const Json saved = request(
      backend,
      request_id++,
      "project.save",
      {{"filePath", target.string()}});
  expect_session(saved, 3, 3, false);

  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 21);
  CHECK(persisted.at("project").at("startScreen") == expected_screen);

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend, 1, "project.open", open_params(target));
  expect_session(reopened, 0, 0, false);
  CHECK(reopened.at("result").at("project").at("startScreen") ==
        expected_screen);
}

void mutates_and_persists_mixed_background_timeline() {
  TemporaryDirectory temporary;
  const std::filesystem::path source = temporary.write(
      "timeline-source.vn.json", valid_document().dump(2));
  const std::filesystem::path target = temporary.path("project.vn.json");

  vnengine::backend::Backend backend;
  const Json opened = request(backend, 1, "project.open", open_params(source));
  expect_session(opened, 0, 0, false);

  const Json added = request(
      backend,
      2,
      "background.add",
      {
          {"sceneId", "scene-1"},
          {"afterNodeId", "dialogue-1"},
      });
  expect_session(added, 1, 0, true);
  const std::string background_id =
      added.at("result").at("nodeId").get<std::string>();
  const Json& added_nodes = added.at("result")
                                .at("project")
                                .at("scenes")[0]
                                .at("nodes");
  CHECK(added_nodes.size() == 2);
  CHECK(added_nodes[0].at("id") == "dialogue-1");
  CHECK(added_nodes[1] == Json({
      {"id", background_id},
      {"type", "background"},
      {"assetId", nullptr},
      {"scalePercent", 100},
  }));

  const Json filled = request(
      backend,
      3,
      "background.update",
      {
          {"sceneId", "scene-1"},
          {"nodeId", background_id},
          {"assetId", "asset-image-1"},
          {"scalePercent", 80},
      });
  expect_session(filled, 2, 0, true);
  CHECK(filled.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("scalePercent") == 80);

  // A dialogue can be inserted relative to a BackgroundNode anchor.
  const Json dialogue = request(
      backend,
      4,
      "dialogue.add",
      {
          {"sceneId", "scene-1"},
          {"speaker", "Bob"},
          {"text", "新背景之后"},
          {"afterNodeId", background_id},
      });
  expect_session(dialogue, 3, 0, true);
  const std::string dialogue_id =
      dialogue.at("result").at("nodeId").get<std::string>();

  // Legal no-op updates/reorders preserve the revision.
  const Json unchanged = request(
      backend,
      5,
      "background.update",
      {
          {"sceneId", "scene-1"},
          {"nodeId", background_id},
          {"assetId", "asset-image-1"},
          {"scalePercent", 80},
      });
  expect_session(unchanged, 3, 0, true);

  const Json moved = request(
      backend,
      6,
      "timeline.reorderMany",
      {
          {"sceneId", "scene-1"},
          {"nodeIds", Json::array({dialogue_id, background_id})},
          {"beforeNodeId", "dialogue-1"},
      });
  expect_session(moved, 4, 0, true);
  const Json& moved_nodes = moved.at("result")
                                .at("project")
                                .at("scenes")[0]
                                .at("nodes");
  // Payload order is ignored; the authoritative Background->Dialogue order
  // is retained when the mixed selection moves.
  CHECK(moved_nodes[0].at("id") == background_id);
  CHECK(moved_nodes[1].at("id") == dialogue_id);
  CHECK(moved_nodes[2].at("id") == "dialogue-1");

  const Json before_failures = request(backend, 7, "project.get");
  const std::vector<std::pair<std::string, Json>> failures{
      {
          "background.update",
          {
              {"sceneId", "scene-1"},
              {"nodeId", background_id},
              {"assetId", "missing"},
              {"scalePercent", 80},
          },
      },
      {
          "background.update",
          {
              {"sceneId", "scene-1"},
              {"nodeId", background_id},
              {"assetId", "asset-image-1"},
              {"scalePercent", 301},
          },
      },
      {
          "background.update",
          {
              {"sceneId", "scene-1"},
              {"nodeId", background_id},
              {"assetId", "asset-image-1"},
          },
      },
      {
          "background.update",
          {
              {"sceneId", "scene-1"},
              {"nodeId", background_id},
              {"assetId", nullptr},
              {"scalePercent", 80},
          },
      },
      {
          "timeline.reorderMany",
          {
              {"sceneId", "scene-1"},
              {"nodeIds", Json::array({dialogue_id, "missing"})},
              {"beforeNodeId", nullptr},
          },
      },
      {
          "timeline.deleteMany",
          {
              {"sceneId", "scene-1"},
              {"nodeIds", Json::array({background_id, "missing"})},
          },
      },
  };
  int request_id = 8;
  for (const auto& [method, params] : failures) {
    const Json failed = request(backend, request_id++, method, params);
    CHECK(failed.at("ok") == false);
    const Json current = request(backend, request_id++, "project.get");
    expect_session(current, 4, 0, true);
    CHECK(current.at("result").at("project") ==
          before_failures.at("result").at("project"));
  }

  const Json saved = request(
      backend,
      request_id++,
      "project.save",
      {{"filePath", target.string()}});
  expect_session(saved, 4, 4, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 21);
  CHECK(persisted.at("project").at("scenes")[0].at("nodes") ==
        moved_nodes);

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend, 1, "project.open", open_params(target));
  expect_session(reopened, 0, 0, false);
  CHECK(reopened.at("result").at("project").at("scenes")[0].at("nodes") ==
        moved_nodes);

  const Json deleted = request(
      reopened_backend,
      2,
      "timeline.deleteMany",
      {
          {"sceneId", "scene-1"},
          {"nodeIds", Json::array({background_id, dialogue_id})},
      });
  expect_session(deleted, 1, 0, true);
  CHECK(deleted.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")
            .size() == 1);
}

void tracks_real_mutations_and_normalizes_project_names() {
  TemporaryDirectory temporary;
  vnengine::backend::Backend backend;

  const Json ping = request(backend, 1, "ping");
  expect_session(ping, 0, std::nullopt, false);
  CHECK(ping.at("result").at("project").is_null());

  const Json created = request(
      backend, 2, "project.create", {{"name", "  学习项目\t"}});
  expect_session(created, 0, std::nullopt, true);
  CHECK(created.at("result").at("project").at("name") == "学习项目");
  const std::string scene_id =
      created.at("result").at("project").at("entrySceneId");

  const Json same_name = request(
      backend, 3, "project.rename", {{"name", " 学习项目 "}});
  expect_session(same_name, 0, std::nullopt, true);

  const Json renamed = request(
      backend, 4, "project.rename", {{"name", "  第一章  "}});
  expect_session(renamed, 1, std::nullopt, true);
  CHECK(renamed.at("result").at("project").at("name") == "第一章");

  const Json scene_no_op = request(
      backend,
      5,
      "scene.rename",
      {{"sceneId", scene_id}, {"name", "场景 1"}});
  expect_session(scene_no_op, 1, std::nullopt, true);

  const Json added = request(backend, 6, "scene.add");
  expect_session(added, 2, std::nullopt, true);

  const Json invalid_name = request(
      backend, 7, "project.rename", {{"name", " \n\t "}});
  CHECK(invalid_name.at("ok") == false);
  CHECK(invalid_name.at("error").at("code") == "project_name_required");

  const Json unchanged = request(backend, 8, "project.get");
  expect_session(unchanged, 2, std::nullopt, true);
  CHECK(unchanged.at("result").at("project").at("name") == "第一章");

  const Json saved = request(
      backend,
      9,
      "project.save",
      {{"filePath", temporary.path("project.vn.json").string()}});
  expect_session(saved, 2, 2, false);

  const Json clean_no_op = request(
      backend, 10, "project.rename", {{"name", " 第一章 "}});
  expect_session(clean_no_op, 2, 2, false);

  const Json dirty_again = request(
      backend, 11, "project.rename", {{"name", "第二章"}});
  expect_session(dirty_again, 3, 2, true);

  const Json wrong_filename = request(
      backend,
      12,
      "project.save",
      {{"filePath", temporary.path("wrong-name.json").string()}});
  CHECK(wrong_filename.at("ok") == false);
  CHECK(wrong_filename.at("error").at("code") == "invalid_params");

  const Json relative_path = request(
      backend,
      13,
      "project.save",
      {{"filePath", "project.vn.json"}});
  CHECK(relative_path.at("ok") == false);
  CHECK(relative_path.at("error").at("code") == "invalid_params");

  const Json still_dirty = request(backend, 14, "project.get");
  expect_session(still_dirty, 3, 2, true);
}

void normalizes_scene_names_and_rejects_blank_commands_atomically() {
  vnengine::backend::Backend backend;

  const Json created = request(
      backend, 1, "project.create", {{"name", "Scene rename project"}});
  expect_session(created, 0, std::nullopt, true);
  const std::string first_scene_id =
      created.at("result").at("project").at("entrySceneId");

  const Json added = request(
      backend, 2, "scene.add", {{"name", "  支线\t"}});
  expect_session(added, 1, std::nullopt, true);
  CHECK(added.at("result").at("project").at("scenes")[1].at("name") ==
        "支线");
  const std::string second_scene_id =
      added.at("result").at("project").at("scenes")[1].at("id");

  const Json blank_add = request(
      backend, 3, "scene.add", {{"name", " \n\t "}});
  CHECK(blank_add.at("ok") == false);
  CHECK(blank_add.at("error").at("code") == "scene_name_required");

  const Json after_blank_add = request(backend, 4, "project.get");
  expect_session(after_blank_add, 1, std::nullopt, true);
  CHECK(after_blank_add.at("result").at("project") ==
        added.at("result").at("project"));

  const Json renamed = request(
      backend,
      5,
      "scene.rename",
      {{"sceneId", first_scene_id}, {"name", "  序章\t"}});
  expect_session(renamed, 2, std::nullopt, true);
  CHECK(renamed.at("result").at("project").at("scenes")[0].at("name") ==
        "序章");

  const Json normalized_no_op = request(
      backend,
      6,
      "scene.rename",
      {{"sceneId", first_scene_id}, {"name", " 序章 "}});
  expect_session(normalized_no_op, 2, std::nullopt, true);

  const Json duplicate_name = request(
      backend,
      7,
      "scene.rename",
      {{"sceneId", second_scene_id}, {"name", "  序章  "}});
  expect_session(duplicate_name, 3, std::nullopt, true);
  CHECK(duplicate_name.at("result")
            .at("project")
            .at("scenes")[1]
            .at("name") == "序章");

  const Json blank_name = request(
      backend,
      8,
      "scene.rename",
      {{"sceneId", first_scene_id}, {"name", " \n\t "}});
  CHECK(blank_name.at("ok") == false);
  CHECK(blank_name.at("error").at("code") == "scene_name_required");

  const Json after_failure = request(backend, 9, "project.get");
  expect_session(after_failure, 3, std::nullopt, true);
  CHECK(after_failure.at("result").at("project") ==
        duplicate_name.at("result").at("project"));
}

void accepts_and_persists_empty_dialogue_fields() {
  TemporaryDirectory temporary;
  const std::filesystem::path target =
      temporary.path("project.vn.json");
  vnengine::backend::Backend backend;

  const Json created = request(
      backend, 1, "project.create", {{"name", "Empty dialogue fields"}});
  expect_session(created, 0, std::nullopt, true);
  const std::string scene_id =
      created.at("result").at("project").at("entrySceneId");

  const Json added = request(
      backend,
      2,
      "dialogue.add",
      {{"sceneId", scene_id}, {"speaker", "  "}, {"text", " \n\t "}});
  expect_session(added, 1, std::nullopt, true);
  const std::string empty_id =
      added.at("result").at("nodeId").get<std::string>();
  const Json& empty_node =
      added.at("result").at("project").at("scenes")[0].at("nodes")[0];
  CHECK(empty_node.at("speaker") == "");
  CHECK(empty_node.at("text") == "");

  const Json committed = request(
      backend,
      3,
      "dialogue.update",
      {{"sceneId", scene_id},
       {"nodeId", empty_id},
       {"speaker", " Alice "},
       {"text", " Hello "}});
  expect_session(committed, 2, std::nullopt, true);
  CHECK(committed.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("speaker") == "Alice");

  const Json cleared = request(
      backend,
      4,
      "dialogue.update",
      {{"sceneId", scene_id},
       {"nodeId", empty_id},
       {"speaker", ""},
       {"text", ""}});
  expect_session(cleared, 3, std::nullopt, true);
  CHECK(cleared.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("speaker") == "");
  CHECK(cleared.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("text") == "");

  const Json following = request(
      backend,
      5,
      "dialogue.add",
      {{"sceneId", scene_id},
       {"speaker", ""},
       {"text", "Following line"},
       {"afterNodeId", empty_id}});
  expect_session(following, 4, std::nullopt, true);
  CHECK(following.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("speaker") == "");
  CHECK(following.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("text") == "Following line");

  const Json saved = request(
      backend, 6, "project.save", {{"filePath", target.string()}});
  expect_session(saved, 4, 4, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("speaker") == "");
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("text") == "");

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend, 1, "project.open", open_params(target));
  expect_session(reopened, 0, 0, false);
  const Json& reopened_nodes = reopened.at("result")
                                   .at("project")
                                   .at("scenes")[0]
                                   .at("nodes");
  CHECK(reopened_nodes.size() == 2);
  CHECK(reopened_nodes[0].at("speaker") == "");
  CHECK(reopened_nodes[0].at("text") == "");
  CHECK(reopened_nodes[1].at("text") == "Following line");
}

void saves_atomically_and_round_trips_assets() {
  TemporaryDirectory temporary;
  const std::filesystem::path source = temporary.write(
      "source.vn.json", valid_document().dump(2));
  const std::filesystem::path target = temporary.write(
      "project.vn.json", "old bytes that must be replaced");

  vnengine::backend::Backend backend;
  const Json opened = request(backend, 1, "project.open", open_params(source));
  expect_session(opened, 0, 0, false);

  const Json renamed = request(
      backend, 2, "project.rename", {{"name", "  保存后的项目  "}});
  expect_session(renamed, 1, 0, true);

  const Json saved = request(
      backend, 3, "project.save", {{"filePath", target.string()}});
  expect_session(saved, 1, 1, false);

  const Json on_disk = Json::parse(read_file(target));
  CHECK(on_disk.at("format") == "vn-engine-project");
  CHECK(on_disk.at("fileVersion") == 21);
  CHECK(on_disk.at("project").at("name") == "保存后的项目");
  CHECK(on_disk.at("assets") == valid_document().at("assets"));

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend,
      1,
      "project.open",
      open_params(target));
  expect_session(reopened, 0, 0, false);
  CHECK(reopened.at("result").at("project") ==
        saved.at("result").at("project"));

  // Saving a clean document is a successful metadata no-op: it does not
  // invent a new revision.
  const Json resaved = request(
      reopened_backend,
      2,
      "project.save",
      {{"filePath", target.string()}});
  expect_session(resaved, 0, 0, false);
}

void backend_preserves_hidden_v2_visuals_across_mutation_and_save() {
  TemporaryDirectory temporary;
  const Json source_document = valid_v2_visual_document();
  const std::filesystem::path source = temporary.write(
      "visual-source.vn.json", source_document.dump(2));
  const std::filesystem::path target =
      temporary.path("project.vn.json");

  vnengine::backend::Backend backend;
  const Json opened = request(backend, 1, "project.open", open_params(source));
  expect_session(opened, 0, 0, false);

  // Renderer gets the safe background Asset ID needed for selection/preview,
  // while future character-instance details remain private for now.
  CHECK(opened.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundAssetId") == "asset-image-1");
  CHECK(!opened.at("result").at("project").at("scenes")[0].contains(
      "visuals"));

  const Json renamed = request(
      backend, 2, "project.rename", {{"name", "视觉保留测试"}});
  expect_session(renamed, 1, 0, true);
  const Json saved = request(
      backend, 3, "project.save", {{"filePath", target.string()}});
  expect_session(saved, 1, 1, false);

  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 21);
  Json expected_visuals =
      source_document.at("project").at("scenes")[0].at("visuals");
  expected_visuals["backgroundScalePercent"] = 100;
  CHECK(persisted.at("project").at("scenes")[0].at("visuals") ==
        expected_visuals);
}

void failed_open_preserves_dirty_hidden_v2_aggregate() {
  TemporaryDirectory temporary;
  const Json source_document = valid_v2_visual_document();
  const std::filesystem::path source = temporary.write(
      "current-v2.vn.json", source_document.dump(2));

  Json invalid_document = valid_v2_visual_document();
  invalid_document["project"]["scenes"][0]["visuals"]
                  ["backgroundAssetId"] = "missing-asset";
  const std::filesystem::path invalid = temporary.write(
      "invalid-v2.vn.json", invalid_document.dump(2));

  Json invalid_timeline_document = valid_v3_timeline_document();
  invalid_timeline_document["project"]["scenes"][0]["nodes"][1]
                           ["assetId"] = "asset-video-1";
  const std::filesystem::path invalid_timeline = temporary.write(
      "invalid-v3-timeline.vn.json", invalid_timeline_document.dump(2));

  Json future_document = valid_v2_visual_document();
  future_document["fileVersion"] = 22;
  const std::filesystem::path future = temporary.write(
      "future-v9.vn.json", future_document.dump(2));
  const std::filesystem::path target =
      temporary.path("project.vn.json");

  vnengine::backend::Backend backend;
  const Json opened = request(backend, 1, "project.open", open_params(source));
  expect_session(opened, 0, 0, false);

  const Json renamed = request(
      backend, 2, "project.rename", {{"name", "失败后仍保留"}});
  expect_session(renamed, 1, 0, true);

  const Json invalid_open = request(
      backend, 3, "project.open", open_params(invalid));
  CHECK(invalid_open.at("ok") == false);
  CHECK(invalid_open.at("error").at("code") == "project_file_invalid");

  const Json after_invalid = request(backend, 4, "project.get");
  expect_session(after_invalid, 1, 0, true);
  CHECK(
      after_invalid.at("result").at("project").at("name") ==
      "失败后仍保留");

  const Json invalid_timeline_open = request(
      backend,
      5,
      "project.open",
      open_params(invalid_timeline));
  CHECK(invalid_timeline_open.at("ok") == false);
  CHECK(invalid_timeline_open.at("error").at("code") ==
        "project_file_invalid");

  const Json after_invalid_timeline = request(backend, 6, "project.get");
  expect_session(after_invalid_timeline, 1, 0, true);
  CHECK(after_invalid_timeline.at("result").at("project").at("name") ==
        "失败后仍保留");

  const Json future_open = request(
      backend, 7, "project.open", open_params(future));
  CHECK(future_open.at("ok") == false);
  CHECK(future_open.at("error").at("code") ==
        "project_file_unsupported");

  const Json after_future = request(backend, 8, "project.get");
  expect_session(after_future, 1, 0, true);
  CHECK(
      after_future.at("result").at("project").at("name") ==
      "失败后仍保留");

  const Json saved = request(
      backend, 9, "project.save", {{"filePath", target.string()}});
  expect_session(saved, 1, 1, false);

  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 21);
  CHECK(persisted.at("project").at("name") == "失败后仍保留");
  Json expected_visuals =
      source_document.at("project").at("scenes")[0].at("visuals");
  expected_visuals["backgroundScalePercent"] = 100;
  CHECK(persisted.at("project").at("scenes")[0].at("visuals") ==
        expected_visuals);
  CHECK(persisted.at("assets") == source_document.at("assets"));
}

void failed_save_preserves_state_and_destination() {
  TemporaryDirectory temporary;
  const std::filesystem::path blocked_target =
      temporary.path("project.vn.json");
  CHECK(std::filesystem::create_directory(blocked_target));
  const std::filesystem::path sentinel =
      blocked_target / "original-content.txt";
  temporary.write("unrelated.txt", "unrelated");
  {
    std::ofstream output(sentinel, std::ios::binary);
    output << "original bytes";
  }

  vnengine::backend::Backend backend;
  const Json created = request(
      backend, 1, "project.create", {{"name", "未保存"}});
  expect_session(created, 0, std::nullopt, true);
  const Json original_project = created.at("result").at("project");

  // Replacing a non-empty directory is guaranteed to fail on supported
  // platforms. The temporary sibling must be removed and the directory's
  // existing bytes must remain intact.
  const Json failed = request(
      backend,
      2,
      "project.save",
      {{"filePath", blocked_target.string()}});
  CHECK(failed.at("ok") == false);
  CHECK(failed.at("error").at("code") == "project_save_failed");
  CHECK(std::filesystem::is_directory(blocked_target));
  CHECK(read_file(sentinel) == "original bytes");

  const Json current = request(backend, 3, "project.get");
  expect_session(current, 0, std::nullopt, true);
  CHECK(current.at("result").at("project") == original_project);

  const std::string temporary_prefix = ".project.vn.json.tmp-";
  for (const auto& entry :
       std::filesystem::directory_iterator(temporary.root())) {
    CHECK(!entry.path().filename().string().starts_with(temporary_prefix));
  }
}

void opens_a_file_and_preserves_current_project_after_failures() {
  TemporaryDirectory temporary;
  const std::filesystem::path valid_path = temporary.write(
      "valid.vn.json", valid_document().dump(2));
  const std::filesystem::path malformed_path = temporary.write(
      "malformed.vn.json", "{not json");

  Json invalid_document = valid_document();
  invalid_document["project"]["entrySceneId"] = "missing";
  const std::filesystem::path invalid_path = temporary.write(
      "invalid.vn.json", invalid_document.dump());

  Json unsupported_document = valid_document();
  unsupported_document["fileVersion"] = 99;
  const std::filesystem::path unsupported_path = temporary.write(
      "future.vn.json", unsupported_document.dump());

  vnengine::backend::Backend backend;
  const Json initial = request(
      backend, 1, "project.create", {{"name", "原项目"}});
  CHECK(initial.at("ok") == true);

  const Json opened = request(
      backend,
      2,
      "project.open",
      open_params(valid_path));
  CHECK(opened.at("ok") == true);
  CHECK(opened.at("result").at("sceneId") == "scene-1");
  CHECK(opened.at("result").at("project").at("name") == "读取的项目");
  const Json authoritative_project = opened.at("result").at("project");

  const std::vector<std::pair<std::string, std::string>> failures{
      {read_file(malformed_path), "project_file_invalid"},
      {read_file(invalid_path), "project_file_invalid"},
      {read_file(unsupported_path), "project_file_unsupported"},
  };

  int request_id = 3;
  for (const auto& [contents, expected_code] : failures) {
    const Json failed = request(
        backend,
        request_id++,
        "project.open",
        {{"contents", contents}});
    CHECK(failed.at("ok") == false);
    CHECK(failed.at("error").at("code") == expected_code);

    const Json current = request(backend, request_id++, "project.get");
    CHECK(current.at("ok") == true);
    CHECK(current.at("result").at("project") == authoritative_project);
  }

  const Json missing_contents = request(
      backend, request_id, "project.open", Json::object());
  CHECK(missing_contents.at("ok") == false);
  CHECK(missing_contents.at("error").at("code") == "invalid_params");
}

void failed_open_does_not_create_a_project() {
  vnengine::backend::Backend backend;

  const Json failed = request(
      backend,
      1,
      "project.open",
      {{"contents", "{not json"}});
  CHECK(failed.at("ok") == false);

  const Json current = request(backend, 2, "project.get");
  CHECK(current.at("ok") == false);
  CHECK(current.at("error").at("code") == "project_not_created");
}

void rejects_project_contents_over_size_limit() {
  vnengine::backend::Backend backend;
  const std::string oversized_contents(
      64U * 1024U * 1024U + 1U, ' ');

  const Json failed = request(
      backend,
      1,
      "project.open",
      {{"contents", oversized_contents}});
  CHECK(failed.at("ok") == false);
  CHECK(failed.at("error").at("code") == "project_file_read_failed");

  const Json current = request(backend, 2, "project.get");
  CHECK(current.at("ok") == false);
  CHECK(current.at("error").at("code") == "project_not_created");
}

void mutates_and_persists_character_timeline() {
  TemporaryDirectory temporary;
  const std::filesystem::path source = temporary.write(
      "character-source.vn.json", migrated_v5_document().dump(2));
  const std::filesystem::path target = temporary.path("project.vn.json");
  vnengine::backend::Backend backend;
  CHECK(request(
            backend, 1, "project.open", open_params(source))
            .at("ok") == true);

  const Json added = request(
      backend,
      2,
      "character.add",
      {
          {"sceneId", "scene-1"},
          {"assetId", "asset-image-1"},
          {"afterNodeId", "dialogue-1"},
      });
  expect_session(added, 1, 0, true);
  const std::string node_id =
      added.at("result").at("nodeId").get<std::string>();
  const Json& initial = added.at("result")
                            .at("project")
                            .at("scenes")[0]
                            .at("nodes")[1];
  CHECK(initial == Json({
      {"id", node_id},
      {"type", "character"},
      {"mode", "show"},
      {"assetId", "asset-image-1"},
      {"slot", "center"},
      {"layer", 1},
      {"scalePercent", 100},
      {"position", nullptr},
      {"effect", nullptr},
  }));

  const Json updated = request(
      backend,
      3,
      "character.update",
      {
          {"sceneId", "scene-1"},
          {"nodeId", node_id},
          {"assetId", "asset-image-1"},
          {"slot", "left"},
          {"layer", 3},
          {"scalePercent", 125},
          {"position", {{"x", 27.5}, {"y", 91.0}}},
      });
  expect_session(updated, 2, 0, true);
  CHECK(updated.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("slot") == "left");
  CHECK(updated.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("position") == Json({{"x", 27.5}, {"y", 91.0}}));
  CHECK(updated.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("scalePercent") == 125);

  const Json failed = request(
      backend,
      4,
      "character.update",
      {
          {"sceneId", "scene-1"},
          {"nodeId", node_id},
          {"assetId", "asset-video-1"},
          {"slot", "right"},
          {"layer", 2},
          {"scalePercent", 125},
          {"position", nullptr},
      });
  CHECK(failed.at("ok") == false);
  CHECK(failed.at("error").at("code") == "asset_not_image");

  const Json invalid_position = request(
      backend,
      5,
      "character.update",
      {
          {"sceneId", "scene-1"},
          {"nodeId", node_id},
          {"assetId", "asset-image-1"},
          {"slot", "right"},
          {"layer", 2},
          {"scalePercent", 125},
          {"position", {{"x", 50}, {"y", 101}}},
      });
  CHECK(invalid_position.at("ok") == false);
  CHECK(invalid_position.at("error").at("code") == "invalid_params");

  const Json missing_scale = request(
      backend,
      55,
      "character.update",
      {
          {"sceneId", "scene-1"},
          {"nodeId", node_id},
          {"assetId", "asset-image-1"},
          {"slot", "right"},
          {"layer", 2},
          {"position", nullptr},
      });
  CHECK(missing_scale.at("ok") == false);
  CHECK(missing_scale.at("error").at("code") == "invalid_params");

  const Json saved = request(
      backend,
      6,
      "project.save",
      {{"filePath", target.string()}});
  expect_session(saved, 2, 2, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 21);
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("assetId") == "asset-image-1");
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("scalePercent") == 125);

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend,
      1,
      "project.open",
      open_params(target));
  CHECK(reopened.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("layer") == 3);
  CHECK(reopened.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("scalePercent") == 125);
  CHECK(reopened.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("position") == Json({{"x", 27.5}, {"y", 91.0}}));
}

void mutates_and_persists_character_modes_atomically() {
  TemporaryDirectory temporary;
  const std::filesystem::path source = temporary.write(
      "character-mode-source.vn.json", migrated_v5_document().dump(2));
  const std::filesystem::path target =
      temporary.path("project.vn.json");
  vnengine::backend::Backend backend;
  CHECK(request(backend, 1, "project.open", open_params(source)).at("ok") ==
        true);

  const Json placeholder_added = request(
      backend, 2, "character.add", {{"sceneId", "scene-1"}});
  CHECK(placeholder_added.at("ok") == true);
  expect_session(placeholder_added, 1, 0, true);
  const std::string placeholder_id =
      placeholder_added.at("result").at("nodeId").get<std::string>();
  const Json& placeholder = placeholder_added.at("result")
                                .at("project")
                                .at("scenes")[0]
                                .at("nodes")[1];
  CHECK(placeholder.at("mode") == "show");
  CHECK(placeholder.at("assetId").is_null());
  CHECK(placeholder.at("scalePercent") == 100);

  const Json clear_added = request(
      backend,
      3,
      "character.add",
      {{"sceneId", "scene-1"}, {"mode", "clear"}});
  CHECK(clear_added.at("ok") == true);
  expect_session(clear_added, 2, 0, true);
  const std::string clear_id =
      clear_added.at("result").at("nodeId").get<std::string>();
  const Json& clear = clear_added.at("result")
                          .at("project")
                          .at("scenes")[0]
                          .at("nodes")[2];
  CHECK(clear.at("mode") == "clear");
  CHECK(clear.at("assetId").is_null());
  CHECK(clear.at("scalePercent") == 100);
  CHECK(clear.at("position").is_null());

  const Json invalid_add = request(
      backend,
      4,
      "character.add",
      {{"sceneId", "scene-1"},
       {"mode", "clear"},
       {"assetId", "asset-image-1"}});
  CHECK(invalid_add.at("ok") == false);
  CHECK(invalid_add.at("error").at("code") == "invalid_params");
  const Json after_invalid_add = request(backend, 5, "project.get");
  CHECK(after_invalid_add.at("ok") == true);
  expect_session(after_invalid_add, 2, 0, true);
  CHECK(after_invalid_add.at("result").at("project") ==
        clear_added.at("result").at("project"));

  // Omitting mode preserves the placeholder's existing show intent while an
  // image is selected later from the block editor.
  const Json assigned = request(
      backend,
      6,
      "character.update",
      {{"sceneId", "scene-1"},
       {"nodeId", placeholder_id},
       {"assetId", "asset-image-1"},
       {"slot", "left"},
       {"layer", 2},
       {"scalePercent", 125},
       {"position", nullptr}});
  CHECK(assigned.at("ok") == true);
  expect_session(assigned, 3, 0, true);
  CHECK(assigned.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("mode") == "show");

  const Json cleared = request(
      backend,
      7,
      "character.update",
      {{"sceneId", "scene-1"},
       {"nodeId", placeholder_id},
       {"mode", "clear"},
       {"assetId", nullptr},
       {"slot", "left"},
       {"layer", 2},
       {"scalePercent", 100},
       {"position", nullptr}});
  CHECK(cleared.at("ok") == true);
  expect_session(cleared, 4, 0, true);
  CHECK(cleared.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("mode") == "clear");
  const Json authoritative = cleared.at("result").at("project");

  const std::vector<Json> rejected{
      // Omitted mode preserves clear, so a non-null Asset is contradictory.
      request(
          backend,
          8,
          "character.update",
          {{"sceneId", "scene-1"},
           {"nodeId", placeholder_id},
           {"assetId", "asset-image-1"},
           {"slot", "left"},
           {"layer", 2},
           {"scalePercent", 100},
           {"position", nullptr}}),
      request(
          backend,
          9,
          "character.update",
          {{"sceneId", "scene-1"},
           {"nodeId", placeholder_id},
           {"mode", "clear"},
           {"assetId", nullptr},
           {"slot", "left"},
           {"layer", 2},
           {"scalePercent", 100},
           {"position", {{"x", 50.0}, {"y", 50.0}}}}),
      request(
          backend,
          10,
          "character.update",
          {{"sceneId", "scene-1"},
           {"nodeId", placeholder_id},
           {"mode", "hide"},
           {"assetId", nullptr},
           {"slot", "left"},
           {"layer", 2},
           {"scalePercent", 100},
           {"position", nullptr}}),
  };
  for (const Json& failure : rejected) {
    CHECK(failure.at("ok") == false);
    CHECK(failure.at("error").at("code") == "invalid_params");
  }
  const Json after_failures = request(backend, 11, "project.get");
  CHECK(after_failures.at("ok") == true);
  expect_session(after_failures, 4, 0, true);
  CHECK(after_failures.at("result").at("project") == authoritative);

  const Json restored = request(
      backend,
      12,
      "character.update",
      {{"sceneId", "scene-1"},
       {"nodeId", placeholder_id},
       {"mode", "show"},
       {"assetId", "asset-image-1"},
       {"slot", "center"},
       {"layer", 1},
       {"scalePercent", 150},
       {"position", nullptr}});
  CHECK(restored.at("ok") == true);
  expect_session(restored, 5, 0, true);
  CHECK(restored.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("mode") == "show");

  const Json saved = request(
      backend, 13, "project.save", {{"filePath", target.string()}});
  CHECK(saved.at("ok") == true);
  expect_session(saved, 5, 5, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 21);
  CHECK(persisted["project"]["scenes"][0]["nodes"][1]["mode"] == "show");
  CHECK(persisted["project"]["scenes"][0]["nodes"][1]["scalePercent"] ==
        150);
  CHECK(persisted["project"]["scenes"][0]["nodes"][2]["mode"] == "clear");

  vnengine::backend::Backend reopened;
  const Json reopened_result = request(
      reopened, 1, "project.open", open_params(target));
  CHECK(reopened_result.at("ok") == true);
  expect_session(reopened_result, 0, 0, false);
  CHECK(reopened_result.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[2]
            .at("id") == clear_id);
  CHECK(reopened_result.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[2]
            .at("mode") == "clear");
}

void mutates_moves_and_persists_character_effects_atomically() {
  TemporaryDirectory temporary;
  const std::filesystem::path source_path = temporary.write(
      "effect-source.vn.json", migrated_v5_document().dump(2));
  const std::filesystem::path target_path =
      temporary.path("project.vn.json");
  vnengine::backend::Backend backend;
  CHECK(request(backend, 1, "project.open", open_params(source_path))
            .at("ok") == true);

  const Json source_added = request(
      backend, 2, "character.add", {{"sceneId", "scene-1"}});
  const std::string source_id =
      source_added.at("result").at("nodeId").get<std::string>();
  const Json target_added = request(
      backend, 3, "character.add", {{"sceneId", "scene-1"}});
  const std::string target_id =
      target_added.at("result").at("nodeId").get<std::string>();
  const Json cleared_added = request(
      backend, 4, "character.add", {{"sceneId", "scene-1"}});
  const std::string cleared_id =
      cleared_added.at("result").at("nodeId").get<std::string>();

  const auto assign_portrait = [&backend](
                                   const int id,
                                   const std::string& node_id,
                                   const std::string& slot) {
    return request(
        backend,
        id,
        "character.update",
        {
            {"sceneId", "scene-1"},
            {"nodeId", node_id},
            {"assetId", "asset-image-1"},
            {"slot", slot},
            {"layer", 1},
            {"scalePercent", 100},
            {"position", nullptr},
        });
  };
  expect_session(assign_portrait(5, source_id, "left"), 4, 0, true);
  expect_session(assign_portrait(6, target_id, "right"), 5, 0, true);

  const Json shake{
      {"type", "shake"},
      {"durationMs", 450},
      {"intensity", "strong"},
  };
  const Json attached = request(
      backend,
      7,
      "characterEffect.update",
      {{"sceneId", "scene-1"},
       {"nodeId", source_id},
       {"effect", shake}});
  expect_session(attached, 6, 0, true);
  CHECK(attached.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("effect") == shake);
  expect_session(
      request(
          backend,
          8,
          "characterEffect.update",
          {{"sceneId", "scene-1"},
           {"nodeId", source_id},
           {"effect", shake}}),
      6,
      0,
      true);

  // The ordinary character route does not erase a side-attached effect.
  const Json portrait_edited = request(
      backend,
      9,
      "character.update",
      {
          {"sceneId", "scene-1"},
          {"nodeId", source_id},
          {"assetId", "asset-image-1"},
          {"slot", "center"},
          {"layer", 2},
          {"scalePercent", 125},
          {"position", {{"x", 45.0}, {"y", 92.0}}},
      });
  expect_session(portrait_edited, 7, 0, true);
  CHECK(portrait_edited.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("effect") == shake);
  const Json before_failures = portrait_edited.at("result").at("project");

  const std::vector<Json> rejected{
      request(
          backend,
          10,
          "characterEffect.update",
          {{"sceneId", "scene-1"},
           {"nodeId", source_id},
           {"effect", {{"type", "shake"}, {"durationMs", 450}}}}),
      request(
          backend,
          11,
          "characterEffect.update",
          {{"sceneId", "scene-1"},
           {"nodeId", cleared_id},
           {"effect", shake}}),
      request(
          backend,
          12,
          "characterEffect.move",
          {{"sceneId", "scene-1"},
           {"fromNodeId", source_id},
           {"toNodeId", target_id},
           {"effect",
            {{"type", "shake"},
             {"durationMs", 451},
             {"intensity", "strong"}}}}),
      request(
          backend,
          13,
          "characterEffect.move",
          {{"sceneId", "scene-1"},
           {"fromNodeId", source_id},
           {"toNodeId", source_id},
           {"effect", shake}}),
      request(
          backend,
          14,
          "characterEffect.move",
          {{"sceneId", "scene-1"},
           {"fromNodeId", source_id},
           {"toNodeId", cleared_id},
           {"effect", shake}}),
  };
  for (const Json& failure : rejected) {
    CHECK(failure.at("ok") == false);
  }
  const Json unchanged = request(backend, 15, "project.get");
  expect_session(unchanged, 7, 0, true);
  CHECK(unchanged.at("result").at("project") == before_failures);

  const Json moved = request(
      backend,
      16,
      "characterEffect.move",
      {{"sceneId", "scene-1"},
       {"fromNodeId", source_id},
       {"toNodeId", target_id},
       {"effect", shake}});
  expect_session(moved, 8, 0, true);
  CHECK(moved.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("effect")
            .is_null());
  CHECK(moved.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[2]
            .at("effect") == shake);

  const Json saved = request(
      backend, 17, "project.save", {{"filePath", target_path.string()}});
  expect_session(saved, 8, 8, false);
  const Json persisted = Json::parse(read_file(target_path));
  CHECK(persisted.at("fileVersion") == 21);
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("nodes")[2]
            .at("effect") == shake);

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend, 1, "project.open", open_params(target_path));
  CHECK(reopened.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[2]
            .at("effect") == shake);

  // Clearing the portrait through character.update clears its effect too.
  const Json cleared = request(
      backend,
      18,
      "character.update",
      {
          {"sceneId", "scene-1"},
          {"nodeId", target_id},
          {"assetId", nullptr},
          {"slot", "right"},
          {"layer", 1},
          {"scalePercent", 100},
          {"position", nullptr},
      });
  expect_session(cleared, 9, 8, true);
  CHECK(cleared.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[2]
            .at("effect")
            .is_null());
}

void mutates_and_persists_scene_jump_timeline() {
  TemporaryDirectory temporary;
  Json source_document = migrated_v6_document();
  source_document["project"]["scenes"].push_back({
      {"schemaVersion", 1},
      {"id", "scene-2"},
      {"name", "第二幕"},
      {"visuals",
       {{"backgroundAssetId", nullptr}, {"characters", Json::array()}}},
      {"nodes",
       Json::array({
           {{"id", "dialogue-2"},
            {"type", "dialogue"},
            {"speaker", "Bob"},
            {"text", "第二幕"}},
       })},
  });
  const std::filesystem::path source = temporary.write(
      "scene-jump-source.vn.json", source_document.dump(2));
  const std::filesystem::path target = temporary.path("project.vn.json");

  vnengine::backend::Backend backend;
  CHECK(request(
            backend, 1, "project.open", open_params(source))
            .at("ok") == true);

  const Json added = request(
      backend,
      2,
      "sceneJump.add",
      {
          {"sceneId", "scene-1"},
          {"targetSceneId", "scene-2"},
          {"afterNodeId", "dialogue-1"},
      });
  CHECK(added.at("ok") == true);
  expect_session(added, 1, 0, true);
  const std::string jump_id =
      added.at("result").at("nodeId").get<std::string>();
  CHECK(added.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1] == Json({
                {"id", jump_id},
                {"type", "sceneJump"},
                {"targetSceneId", "scene-2"},
            }));

  const Json self_target = request(
      backend,
      3,
      "sceneJump.update",
      {
          {"sceneId", "scene-1"},
          {"nodeId", jump_id},
          {"targetSceneId", "scene-1"},
      });
  CHECK(self_target.at("ok") == false);
  CHECK(self_target.at("error").at("code") == "scene_jump_self_target");

  const Json delete_target = request(
      backend, 4, "scene.delete", {{"sceneId", "scene-2"}});
  CHECK(delete_target.at("ok") == false);
  CHECK(delete_target.at("error").at("code") == "scene_in_use");

  const Json saved = request(
      backend, 5, "project.save", {{"filePath", target.string()}});
  CHECK(saved.at("ok") == true);
  expect_session(saved, 1, 1, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 21);
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("targetSceneId") == "scene-2");

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend,
      1,
      "project.open",
      open_params(target));
  CHECK(reopened.at("ok") == true);
  CHECK(reopened.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("type") == "sceneJump");
}

void mutates_and_persists_choice_timeline_transactionally() {
  TemporaryDirectory temporary;
  const std::filesystem::path target = temporary.path("project.vn.json");
  vnengine::backend::Backend backend;

  const Json created = request(
      backend, 1, "project.create", {{"name", "Choice timeline"}});
  expect_session(created, 0, std::nullopt, true);
  const std::string first_scene_id =
      created.at("result").at("sceneId").get<std::string>();
  const Json second_scene = request(backend, 2, "scene.add");
  expect_session(second_scene, 1, std::nullopt, true);
  const std::string second_scene_id =
      second_scene.at("result").at("sceneId").get<std::string>();

  const Json dialogue = request(
      backend,
      3,
      "dialogue.add",
      {
          {"sceneId", first_scene_id},
          {"speaker", "Alice"},
          {"text", "请选择"},
      });
  expect_session(dialogue, 2, std::nullopt, true);
  const std::string dialogue_id =
      dialogue.at("result").at("nodeId").get<std::string>();

  const Json choice_added = request(
      backend,
      4,
      "choice.add",
      {{"sceneId", first_scene_id}, {"afterNodeId", dialogue_id}});
  expect_session(choice_added, 3, std::nullopt, true);
  const std::string choice_id =
      choice_added.at("result").at("nodeId").get<std::string>();
  CHECK(choice_added.at("result").at("sceneId") == first_scene_id);
  CHECK(choice_added.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1] == Json({
                {"id", choice_id},
                {"type", "choice"},
                {"options", Json::array()},
            }));

  const Json first_option = request(
      backend,
      5,
      "choice.option.add",
      {
          {"sceneId", first_scene_id},
          {"nodeId", choice_id},
          {"text", "  前往第二幕  "},
          {"targetSceneId", second_scene_id},
      });
  expect_session(first_option, 4, std::nullopt, true);
  const std::string first_option_id =
      first_option.at("result").at("optionId").get<std::string>();
  CHECK(first_option.at("result").at("sceneId") == first_scene_id);
  CHECK(first_option.at("result").at("nodeId") == choice_id);
  CHECK(first_option.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("options")[0]
            .at("text") == "前往第二幕");

  const Json second_option = request(
      backend,
      6,
      "choice.option.add",
      {
          {"sceneId", first_scene_id},
          {"nodeId", choice_id},
          {"text", "留下"},
          {"targetSceneId", first_scene_id},
      });
  expect_session(second_option, 5, std::nullopt, true);
  const std::string second_option_id =
      second_option.at("result").at("optionId").get<std::string>();
  const Json third_option = request(
      backend,
      7,
      "choice.option.add",
      {
          {"sceneId", first_scene_id},
          {"nodeId", choice_id},
          {"text", "重新考虑"},
          {"targetSceneId", first_scene_id},
          {"beforeOptionId", second_option_id},
      });
  expect_session(third_option, 6, std::nullopt, true);
  const std::string third_option_id =
      third_option.at("result").at("optionId").get<std::string>();
  CHECK(third_option.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("options")[1]
            .at("id") == third_option_id);

  const Json unchanged = request(
      backend,
      8,
      "choice.option.update",
      {
          {"sceneId", first_scene_id},
          {"nodeId", choice_id},
          {"optionId", first_option_id},
          {"text", " 前往第二幕 "},
          {"targetSceneId", second_scene_id},
      });
  expect_session(unchanged, 6, std::nullopt, true);

  const Json empty_text = request(
      backend,
      9,
      "choice.option.update",
      {
          {"sceneId", first_scene_id},
          {"nodeId", choice_id},
          {"optionId", first_option_id},
          {"text", " \t "},
          {"targetSceneId", first_scene_id},
      });
  CHECK(empty_text.at("ok") == false);
  CHECK(empty_text.at("error").at("code") == "choice_text_required");
  const Json missing_target = request(
      backend,
      10,
      "choice.option.update",
      {
          {"sceneId", first_scene_id},
          {"nodeId", choice_id},
          {"optionId", first_option_id},
          {"text", "无效"},
          {"targetSceneId", "missing"},
      });
  CHECK(missing_target.at("ok") == false);
  CHECK(missing_target.at("error").at("code") ==
        "target_scene_not_found");
  const Json after_failures = request(backend, 11, "project.get");
  expect_session(after_failures, 6, std::nullopt, true);
  CHECK(after_failures.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("options")[0]
            .at("targetSceneId") == second_scene_id);

  const Json updated = request(
      backend,
      12,
      "choice.option.update",
      {
          {"sceneId", first_scene_id},
          {"nodeId", choice_id},
          {"optionId", first_option_id},
          {"text", "进入第二幕"},
          {"targetSceneId", second_scene_id},
      });
  expect_session(updated, 7, std::nullopt, true);
  const Json reordered = request(
      backend,
      13,
      "choice.option.reorder",
      {
          {"sceneId", first_scene_id},
          {"nodeId", choice_id},
          {"optionId", second_option_id},
          {"beforeOptionId", first_option_id},
      });
  expect_session(reordered, 8, std::nullopt, true);
  CHECK(reordered.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("options")[0]
            .at("id") == second_option_id);
  const Json reorder_noop = request(
      backend,
      14,
      "choice.option.reorder",
      {
          {"sceneId", first_scene_id},
          {"nodeId", choice_id},
          {"optionId", second_option_id},
          {"beforeOptionId", first_option_id},
      });
  expect_session(reorder_noop, 8, std::nullopt, true);

  const Json delete_target = request(
      backend, 15, "scene.delete", {{"sceneId", second_scene_id}});
  CHECK(delete_target.at("ok") == false);
  CHECK(delete_target.at("error").at("code") == "scene_in_use");
  const Json option_deleted = request(
      backend,
      16,
      "choice.option.delete",
      {
          {"sceneId", first_scene_id},
          {"nodeId", choice_id},
          {"optionId", first_option_id},
      });
  expect_session(option_deleted, 9, std::nullopt, true);
  const Json missing_option = request(
      backend,
      17,
      "choice.option.delete",
      {
          {"sceneId", first_scene_id},
          {"nodeId", choice_id},
          {"optionId", first_option_id},
      });
  CHECK(missing_option.at("ok") == false);
  CHECK(missing_option.at("error").at("code") ==
        "choice_option_not_found");

  const Json timeline_reordered = request(
      backend,
      18,
      "timeline.reorder",
      {
          {"sceneId", first_scene_id},
          {"nodeId", choice_id},
          {"beforeNodeId", dialogue_id},
      });
  expect_session(timeline_reordered, 10, std::nullopt, true);
  const Json scene_deleted = request(
      backend, 19, "scene.delete", {{"sceneId", second_scene_id}});
  expect_session(scene_deleted, 11, std::nullopt, true);

  const Json saved = request(
      backend, 20, "project.save", {{"filePath", target.string()}});
  expect_session(saved, 11, 11, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 21);
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("type") == "choice");
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("options") == Json::array({
                {
                    {"id", second_option_id},
                    {"text", "留下"},
                    {"targetSceneId", first_scene_id},
                },
                {
                    {"id", third_option_id},
                    {"text", "重新考虑"},
                    {"targetSceneId", first_scene_id},
                },
            }));

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend, 1, "project.open", open_params(target));
  expect_session(reopened, 0, 0, false);
  CHECK(reopened.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("options").size() == 2);
}

void mutates_and_persists_dialogue_voice_and_bgm() {
  TemporaryDirectory temporary;
  const std::filesystem::path target = temporary.path("project.vn.json");
  const std::filesystem::path audio_source = temporary.write(
      "Theme.mp3", mp3_audio_bytes());
  const std::filesystem::path image_source = temporary.write(
      "Poster.png", png_image_bytes());

  vnengine::backend::Backend backend;
  const Json created = request(
      backend, 1, "project.create", {{"name", "Audio timeline"}});
  const std::string scene_id =
      created.at("result").at("sceneId").get<std::string>();
  expect_session(created, 0, std::nullopt, true);
  expect_session(
      request(backend, 2, "project.save", {{"filePath", target.string()}}),
      0,
      0,
      false);

  const Json audio_import = request(
      backend,
      3,
      "asset.import",
      {{"kind", "audio"},
       {"sourceFilePath", audio_source.string()},
       {"projectFilePath", target.string()}});
  expect_session(audio_import, 1, 0, true);
  const std::string audio_id =
      audio_import.at("result").at("assetId").get<std::string>();
  const Json image_import = request(
      backend,
      4,
      "asset.import",
      {{"kind", "image"},
       {"sourceFilePath", image_source.string()},
       {"projectFilePath", target.string()}});
  expect_session(image_import, 2, 0, true);
  const std::string image_id =
      image_import.at("result").at("assetId").get<std::string>();

  const Json dialogue_added = request(
      backend,
      5,
      "dialogue.add",
      {{"sceneId", scene_id}, {"speaker", "Alice"}, {"text", "Hello"}});
  expect_session(dialogue_added, 3, 0, true);
  const std::string dialogue_id =
      dialogue_added.at("result").at("nodeId").get<std::string>();
  CHECK(dialogue_added.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("voiceAssetId")
            .is_null());

  const Json voice_set = request(
      backend,
      6,
      "dialogue.setVoice",
      {{"sceneId", scene_id}, {"nodeId", dialogue_id}, {"assetId", audio_id}});
  expect_session(voice_set, 4, 0, true);
  CHECK(voice_set.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("voiceAssetId") == audio_id);
  expect_session(
      request(
          backend,
          7,
          "dialogue.setVoice",
          {{"sceneId", scene_id},
           {"nodeId", dialogue_id},
           {"assetId", audio_id}}),
      4,
      0,
      true);
  const Json invalid_voice = request(
      backend,
      8,
      "dialogue.setVoice",
      {{"sceneId", scene_id}, {"nodeId", dialogue_id}, {"assetId", image_id}});
  CHECK(invalid_voice.at("ok") == false);
  CHECK(invalid_voice.at("error").at("code") == "asset_not_audio");
  expect_session(
      request(
          backend,
          9,
          "dialogue.setVoice",
          {{"sceneId", scene_id}, {"nodeId", dialogue_id}, {"assetId", nullptr}}),
      5,
      0,
      true);
  expect_session(
      request(
          backend,
          10,
          "dialogue.setVoice",
          {{"sceneId", scene_id},
           {"nodeId", dialogue_id},
           {"assetId", audio_id}}),
      6,
      0,
      true);

  const Json bgm_added = request(
      backend,
      11,
      "bgm.add",
      {{"sceneId", scene_id}, {"afterNodeId", dialogue_id}});
  expect_session(bgm_added, 7, 0, true);
  const std::string bgm_id =
      bgm_added.at("result").at("nodeId").get<std::string>();
  CHECK(bgm_added.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1] == Json({
                {"id", bgm_id}, {"type", "bgm"}, {"assetId", nullptr}}));

  expect_session(
      request(
          backend,
          12,
          "bgm.update",
          {{"sceneId", scene_id}, {"nodeId", bgm_id}, {"assetId", audio_id}}),
      8,
      0,
      true);
  expect_session(
      request(
          backend,
          13,
          "bgm.update",
          {{"sceneId", scene_id}, {"nodeId", bgm_id}, {"assetId", audio_id}}),
      8,
      0,
      true);
  const Json invalid_bgm = request(
      backend,
      14,
      "bgm.update",
      {{"sceneId", scene_id}, {"nodeId", bgm_id}, {"assetId", image_id}});
  CHECK(invalid_bgm.at("ok") == false);
  CHECK(invalid_bgm.at("error").at("code") == "asset_not_audio");
  expect_session(
      request(
          backend,
          15,
          "bgm.update",
          {{"sceneId", scene_id}, {"nodeId", bgm_id}, {"assetId", nullptr}}),
      9,
      0,
      true);
  expect_session(
      request(
          backend,
          16,
          "bgm.update",
          {{"sceneId", scene_id}, {"nodeId", bgm_id}, {"assetId", audio_id}}),
      10,
      0,
      true);

  const Json reordered = request(
      backend,
      17,
      "timeline.reorder",
      {{"sceneId", scene_id},
       {"nodeId", bgm_id},
       {"beforeNodeId", dialogue_id}});
  expect_session(reordered, 11, 0, true);
  CHECK(reordered.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("type") == "bgm");

  const Json saved = request(
      backend, 18, "project.save", {{"filePath", target.string()}});
  expect_session(saved, 11, 11, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 21);
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("assetId") == audio_id);
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("voiceAssetId") == audio_id);

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend, 1, "project.open", open_params(target));
  expect_session(reopened, 0, 0, false);
  CHECK(reopened.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("type") == "bgm");
  CHECK(reopened.at("result").at("assets")[0].at("type") == "audio");
}

void mutates_and_persists_video_timeline() {
  TemporaryDirectory temporary;
  const std::filesystem::path target = temporary.path("project.vn.json");
  const std::filesystem::path video_source = temporary.write(
      "Opening.mp4", mp4_video_bytes());
  const std::filesystem::path image_source = temporary.write(
      "Poster.png", png_image_bytes());

  vnengine::backend::Backend backend;
  const Json created = request(
      backend, 1, "project.create", {{"name", "Video timeline"}});
  const std::string scene_id =
      created.at("result").at("sceneId").get<std::string>();
  expect_session(created, 0, std::nullopt, true);
  expect_session(
      request(backend, 2, "project.save", {{"filePath", target.string()}}),
      0,
      0,
      false);

  const Json video_import = request(
      backend,
      3,
      "asset.import",
      {{"kind", "video"},
       {"sourceFilePath", video_source.string()},
       {"projectFilePath", target.string()}});
  expect_session(video_import, 1, 0, true);
  const std::string video_asset_id =
      video_import.at("result").at("assetId").get<std::string>();
  const Json image_import = request(
      backend,
      4,
      "asset.import",
      {{"kind", "image"},
       {"sourceFilePath", image_source.string()},
       {"projectFilePath", target.string()}});
  expect_session(image_import, 2, 0, true);
  const std::string image_asset_id =
      image_import.at("result").at("assetId").get<std::string>();

  const Json dialogue_added = request(
      backend,
      5,
      "dialogue.add",
      {{"sceneId", scene_id}, {"speaker", "Alice"}, {"text", "Opening"}});
  expect_session(dialogue_added, 3, 0, true);
  const std::string dialogue_id =
      dialogue_added.at("result").at("nodeId").get<std::string>();

  const Json video_added = request(
      backend,
      6,
      "video.add",
      {{"sceneId", scene_id}, {"afterNodeId", dialogue_id}});
  expect_session(video_added, 4, 0, true);
  const std::string video_node_id =
      video_added.at("result").at("nodeId").get<std::string>();
  CHECK(video_added.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1] == Json({
                {"id", video_node_id},
                {"type", "video"},
                {"assetId", nullptr},
            }));

  const Json invalid_add = request(
      backend,
      7,
      "video.add",
      {{"sceneId", scene_id}, {"assetId", video_asset_id}});
  CHECK(invalid_add.at("ok") == false);
  CHECK(invalid_add.at("error").at("code") == "invalid_params");
  const Json missing_asset = request(
      backend,
      8,
      "video.update",
      {{"sceneId", scene_id},
       {"nodeId", video_node_id},
       {"assetId", "missing"}});
  CHECK(missing_asset.at("ok") == false);
  CHECK(missing_asset.at("error").at("code") == "asset_not_found");
  const Json wrong_asset = request(
      backend,
      9,
      "video.update",
      {{"sceneId", scene_id},
       {"nodeId", video_node_id},
       {"assetId", image_asset_id}});
  CHECK(wrong_asset.at("ok") == false);
  CHECK(wrong_asset.at("error").at("code") == "asset_not_video");
  const Json wrong_node = request(
      backend,
      10,
      "video.update",
      {{"sceneId", scene_id},
       {"nodeId", dialogue_id},
       {"assetId", video_asset_id}});
  CHECK(wrong_node.at("ok") == false);
  CHECK(wrong_node.at("error").at("code") == "video_node_not_found");
  const Json after_failures = request(backend, 11, "project.get");
  expect_session(after_failures, 4, 0, true);
  CHECK(after_failures.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("assetId")
            .is_null());

  expect_session(
      request(
          backend,
          12,
          "video.update",
          {{"sceneId", scene_id},
           {"nodeId", video_node_id},
           {"assetId", video_asset_id}}),
      5,
      0,
      true);
  expect_session(
      request(
          backend,
          13,
          "video.update",
          {{"sceneId", scene_id},
           {"nodeId", video_node_id},
           {"assetId", video_asset_id}}),
      5,
      0,
      true);
  expect_session(
      request(
          backend,
          14,
          "video.update",
          {{"sceneId", scene_id},
           {"nodeId", video_node_id},
           {"assetId", nullptr}}),
      6,
      0,
      true);
  expect_session(
      request(
          backend,
          15,
          "video.update",
          {{"sceneId", scene_id},
           {"nodeId", video_node_id},
           {"assetId", video_asset_id}}),
      7,
      0,
      true);

  const Json reordered = request(
      backend,
      16,
      "timeline.reorder",
      {{"sceneId", scene_id},
       {"nodeId", video_node_id},
       {"beforeNodeId", dialogue_id}});
  expect_session(reordered, 8, 0, true);
  CHECK(reordered.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("type") == "video");

  const Json saved = request(
      backend, 17, "project.save", {{"filePath", target.string()}});
  expect_session(saved, 8, 8, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 21);
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("nodes")[0] == Json({
                {"id", video_node_id},
                {"type", "video"},
                {"assetId", video_asset_id},
            }));

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend, 1, "project.open", open_params(target));
  expect_session(reopened, 0, 0, false);
  CHECK(reopened.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("assetId") == video_asset_id);
  CHECK(reopened.at("result").at("assets")[0].at("type") == "video");
}

void mutates_and_persists_story_extension_timeline() {
  TemporaryDirectory temporary;
  const std::filesystem::path target = temporary.path("project.vn.json");
  vnengine::backend::Backend backend;

  const Json created = request(
      backend, 1, "project.create", {{"name", "Story extension"}});
  const std::string scene_id =
      created.at("result").at("sceneId").get<std::string>();
  const Json first = request(
      backend,
      2,
      "dialogue.add",
      {{"sceneId", scene_id}, {"speaker", "Alice"}, {"text", "第一页"}});
  const std::string first_id =
      first.at("result").at("nodeId").get<std::string>();
  const Json second = request(
      backend,
      3,
      "dialogue.add",
      {{"sceneId", scene_id}, {"speaker", "Bob"}, {"text", "第二页"}});
  const std::string second_id =
      second.at("result").at("nodeId").get<std::string>();

  const Json added = request(
      backend,
      4,
      "storyExtension.add",
      {{"sceneId", scene_id}, {"beforeNodeId", second_id}});
  expect_session(added, 3, std::nullopt, true);
  const std::string extension_id =
      added.at("result").at("nodeId").get<std::string>();
  CHECK(added.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1] == Json({
                {"id", extension_id},
                {"type", "storyExtension"},
            }));

  const Json placement_conflict = request(
      backend,
      5,
      "storyExtension.add",
      {{"sceneId", scene_id},
       {"afterNodeId", first_id},
       {"beforeNodeId", second_id}});
  CHECK(placement_conflict.at("ok") == false);
  CHECK(placement_conflict.at("error").at("code") ==
        "story_extension_placement_conflict");
  const Json unchanged = request(backend, 6, "project.get");
  expect_session(unchanged, 3, std::nullopt, true);
  CHECK(unchanged.at("result").at("project") ==
        added.at("result").at("project"));

  const Json saved = request(
      backend, 7, "project.save", {{"filePath", target.string()}});
  expect_session(saved, 3, 3, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 21);
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("nodes")[1] == Json({
                {"id", extension_id},
                {"type", "storyExtension"},
            }));

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend, 1, "project.open", open_params(target));
  expect_session(reopened, 0, 0, false);
  const Json reordered = request(
      reopened_backend,
      2,
      "timeline.reorder",
      {{"sceneId", scene_id},
       {"nodeId", extension_id},
       {"beforeNodeId", first_id}});
  expect_session(reordered, 1, 0, true);
  CHECK(reordered.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("id") == extension_id);

  const Json deleted = request(
      reopened_backend,
      3,
      "timeline.deleteMany",
      {{"sceneId", scene_id}, {"nodeIds", Json::array({extension_id})}});
  expect_session(deleted, 2, 0, true);
  CHECK(deleted.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")
            .size() == 2);
}

void mutates_persists_and_guards_logic_timeline() {
  TemporaryDirectory temporary;
  const std::filesystem::path target = temporary.path("project.vn.json");
  vnengine::backend::Backend backend;

  const Json created = request(
      backend, 1, "project.create", {{"name", "Logic timeline"}});
  expect_session(created, 0, std::nullopt, true);
  const std::string scene_id = created.at("result")
      .at("project")
      .at("entrySceneId")
      .get<std::string>();
  for (const Json& invalid : {
           request(
               backend,
               101,
               "variableSet.add",
               {{"sceneId", scene_id},
                {"variableName", "route"},
                {"value", true},
                {"evil", 1}}),
           request(
               backend,
               100,
               "variableSet.add",
               {{"sceneId", scene_id}, {"variableName", "route"}}),
           request(
               backend,
               102,
               "variableSet.add",
               {{"sceneId", scene_id},
                {"variableName", std::string("bad\0name", 8)},
                {"value", true}}),
           request(
               backend,
               103,
               "variableSet.add",
               {{"sceneId", scene_id},
                {"variableName", std::string(65, 'x')},
                {"value", true}}),
           request(
               backend,
               104,
               "variableSet.add",
               {{"sceneId", scene_id},
                {"variableName", "text"},
                {"value", std::string(4097, 'x')}}),
           request(
               backend,
               105,
               "variableChange.add",
               {{"sceneId", scene_id},
                {"variableName", "score"},
                {"amount", std::numeric_limits<double>::quiet_NaN()}}),
       }) {
    CHECK(invalid.at("ok") == false);
    CHECK(invalid.at("error").at("code") == "invalid_params");
  }
  expect_session(request(backend, 106, "project.get"), 0, std::nullopt, true);
  const Json condition{
      {"left", {{"kind", "variable"}, {"name", "route"}}},
      {"operator", "gte"},
      {"right", {{"kind", "literal"}, {"value", 2}}},
  };
  const Json added_if = request(
      backend,
      2,
      "logicIf.add",
      {{"sceneId", scene_id}, {"condition", condition}});
  expect_session(added_if, 1, std::nullopt, true);
  const std::string if_id =
      added_if.at("result").at("nodeId").get<std::string>();
  const Json& if_nodes = added_if.at("result")
      .at("project")
      .at("scenes")[0]
      .at("nodes");
  CHECK(if_nodes.size() == 3);
  CHECK(if_nodes[0].at("type") == "logicIf");
  CHECK(if_nodes[1].at("type") == "logicElse");
  CHECK(if_nodes[1].at("ifNodeId") == if_id);
  CHECK(if_nodes[2].at("type") == "logicEndIf");
  CHECK(if_nodes[2].at("ifNodeId") == if_id);
  const std::string else_id = if_nodes[1].at("id").get<std::string>();

  const Json variable = request(
      backend,
      3,
      "variableSet.add",
      {{"sceneId", scene_id},
       {"variableName", "route"},
       {"value", 3},
       {"beforeNodeId", else_id}});
  expect_session(variable, 2, std::nullopt, true);
  const Json repeat = request(
      backend,
      4,
      "logicRepeat.add",
      {{"sceneId", scene_id}, {"count", 2}, {"beforeNodeId", else_id}});
  expect_session(repeat, 3, std::nullopt, true);

  const Json split = request(
      backend,
      5,
      "storyExtension.add",
      {{"sceneId", scene_id}, {"beforeNodeId", else_id}});
  CHECK(split.at("ok") == false);
  CHECK(split.at("error").at("code") == "story_extension_logic_boundary");
  const Json partial_delete = request(
      backend,
      6,
      "timeline.deleteMany",
      {{"sceneId", scene_id}, {"nodeIds", Json::array({if_id})}});
  CHECK(partial_delete.at("ok") == false);
  CHECK(partial_delete.at("error").at("code") ==
        "logic_control_atomic_required");
  const Json invalid_repeat = request(
      backend,
      7,
      "logicRepeat.update",
      {{"sceneId", scene_id},
       {"nodeId", repeat.at("result").at("nodeId")},
       {"count", 1001}});
  CHECK(invalid_repeat.at("ok") == false);
  CHECK(invalid_repeat.at("error").at("code") == "invalid_params");

  const Json saved = request(
      backend, 8, "project.save", {{"filePath", target.string()}});
  expect_session(saved, 3, 3, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 21);
  CHECK(persisted.at("project").at("scenes")[0].at("nodes").size() == 6);

  vnengine::backend::Backend reopened;
  const Json opened = request(
      reopened, 1, "project.open", open_params(target));
  expect_session(opened, 0, 0, false);
  CHECK(opened.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes") ==
        saved.at("result").at("project").at("scenes")[0].at("nodes"));
  const Json deleted = request(
      reopened,
      2,
      "logicControl.delete",
      {{"sceneId", scene_id}, {"nodeId", if_id}});
  expect_session(deleted, 1, 0, true);
  CHECK(deleted.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")
            .empty());

  Json malformed = persisted;
  malformed["project"]["scenes"][0]["nodes"].erase(4);
  expect_file_error(malformed, vnengine::backend::ProjectFileErrorKind::invalid_document);
  malformed = persisted;
  malformed["project"]["scenes"][0]["nodes"][1]["variableName"] =
      std::string("bad\0name", 8);
  expect_file_error(malformed, vnengine::backend::ProjectFileErrorKind::invalid_document);
  malformed = persisted;
  malformed["project"]["scenes"][0]["nodes"][1]["unexpected"] = true;
  expect_file_error(
      malformed,
      vnengine::backend::ProjectFileErrorKind::invalid_document);
  Json legacy_with_logic = persisted;
  legacy_with_logic["fileVersion"] = 15;
  legacy_with_logic["project"]["startScreen"].erase("eyebrow");
  legacy_with_logic["project"]["scenes"][0]["visuals"].erase(
      "backgroundScalePercent");
  expect_file_error(
      legacy_with_logic,
      vnengine::backend::ProjectFileErrorKind::unsupported_format);

  vnengine::backend::Backend limit_backend;
  const Json limit_created = request(
      limit_backend, 1, "project.create", {{"name", "Variable limit"}});
  const std::string limit_scene_id = limit_created.at("result")
      .at("project")
      .at("entrySceneId")
      .get<std::string>();
  for (std::size_t index = 0;
       index < vnengine::kMaximumLogicVariableCount;
       ++index) {
    const Json added = request(
        limit_backend,
        static_cast<int>(index) + 2,
        "variableSet.add",
        {{"sceneId", limit_scene_id},
         {"variableName", "variable-" + std::to_string(index)},
         {"value", static_cast<double>(index)}});
    CHECK(added.at("ok") == true);
  }
  const Json budget_if = request(
      limit_backend,
      90,
      "logicIf.add",
      {{"sceneId", limit_scene_id},
       {"condition",
        {{"left", {{"kind", "variable"}, {"name", "variable-0"}}},
         {"operator", "eq"},
         {"right", {{"kind", "literal"}, {"value", true}}}}}});
  CHECK(budget_if.at("ok") == true);
  const Json update_overflow = request(
      limit_backend,
      91,
      "logicIf.update",
      {{"sceneId", limit_scene_id},
       {"nodeId", budget_if.at("result").at("nodeId")},
       {"condition",
        {{"left", {{"kind", "variable"}, {"name", "overflow"}}},
         {"operator", "eq"},
         {"right", {{"kind", "literal"}, {"value", true}}}}}});
  CHECK(update_overflow.at("ok") == false);
  CHECK(update_overflow.at("error").at("code") ==
        "logic_variable_limit");
  const Json overflow = request(
      limit_backend,
      100,
      "variableSet.add",
      {{"sceneId", limit_scene_id},
       {"variableName", "overflow"},
       {"value", true}});
  CHECK(overflow.at("ok") == false);
  CHECK(overflow.at("error").at("code") == "logic_variable_limit");
  expect_session(
      request(limit_backend, 101, "project.get"),
      vnengine::kMaximumLogicVariableCount + 1,
      std::nullopt,
      true);
}

void mutates_persists_and_guards_cg_display_timeline() {
  TemporaryDirectory temporary;
  const std::filesystem::path target = temporary.path("project.vn.json");
  vnengine::backend::Backend backend;

  const Json opened = request(
      backend,
      1,
      "project.open",
      {{"contents", migrated_v17_document().dump()}});
  expect_session(opened, 0, 0, false);
  const std::string scene_id = opened.at("result")
      .at("project")
      .at("entrySceneId")
      .get<std::string>();
  const Json condition{
      {"left", {{"kind", "literal"}, {"value", true}}},
      {"operator", "eq"},
      {"right", {{"kind", "literal"}, {"value", true}}},
  };
  const Json added_if = request(
      backend,
      2,
      "logicIf.add",
      {{"sceneId", scene_id}, {"condition", condition}});
  expect_session(added_if, 1, 0, true);
  const Json& if_nodes = added_if.at("result")
      .at("project")
      .at("scenes")[0]
      .at("nodes");
  const std::string else_id = if_nodes[2].at("id").get<std::string>();
  const std::string end_if_id = if_nodes[3].at("id").get<std::string>();

  const Json added_display = request(
      backend,
      3,
      "cgDisplay.add",
      {{"sceneId", scene_id},
       {"assetId", "asset-image-1"},
       {"leadInMs", 1250},
       {"beforeNodeId", else_id}});
  expect_session(added_display, 2, 0, true);
  const std::string display_id =
      added_display.at("result").at("nodeId").get<std::string>();
  const Json& display_nodes = added_display.at("result")
      .at("project")
      .at("scenes")[0]
      .at("nodes");
  CHECK(display_nodes[2].at("type") == "cgDisplay");
  CHECK(display_nodes[2].at("assetId") == "asset-image-1");
  CHECK(display_nodes[2].at("leadInMs") == 1250);
  CHECK(display_nodes[3].at("type") == "cgEndDisplay");
  CHECK(display_nodes[3].at("cgDisplayNodeId") == display_id);
  const std::string end_display_id =
      display_nodes[3].at("id").get<std::string>();

  const Json dialogue = request(
      backend,
      4,
      "dialogue.add",
      {{"sceneId", scene_id},
       {"speaker", "Alice"},
       {"text", "The CG is visible."},
       {"beforeNodeId", end_display_id}});
  expect_session(dialogue, 3, 0, true);
  const std::string dialogue_id =
      dialogue.at("result").at("nodeId").get<std::string>();

  const Json invalid_background = request(
      backend,
      5,
      "background.add",
      {{"sceneId", scene_id}, {"beforeNodeId", end_display_id}});
  CHECK(invalid_background.at("ok") == false);
  CHECK(invalid_background.at("error").at("code") ==
        "cg_display_body_invalid");
  const Json wrong_asset = request(
      backend,
      6,
      "cgDisplay.update",
      {{"sceneId", scene_id},
       {"nodeId", display_id},
       {"assetId", "asset-video-1"},
       {"leadInMs", 1250}});
  CHECK(wrong_asset.at("ok") == false);
  CHECK(wrong_asset.at("error").at("code") == "asset_not_image");
  const Json invalid_lead = request(
      backend,
      7,
      "cgDisplay.update",
      {{"sceneId", scene_id},
       {"nodeId", display_id},
       {"assetId", "asset-image-1"},
       {"leadInMs", 1.5}});
  CHECK(invalid_lead.at("ok") == false);
  CHECK(invalid_lead.at("error").at("code") == "invalid_params");
  expect_session(request(backend, 8, "project.get"), 3, 0, true);

  const Json partial_delete = request(
      backend,
      9,
      "timeline.deleteMany",
      {{"sceneId", scene_id}, {"nodeIds", Json::array({display_id})}});
  CHECK(partial_delete.at("ok") == false);
  CHECK(partial_delete.at("error").at("code") ==
        "cg_display_atomic_required");
  const Json partial_reorder = request(
      backend,
      10,
      "timeline.reorder",
      {{"sceneId", scene_id},
       {"nodeId", display_id},
       {"beforeNodeId", end_if_id}});
  CHECK(partial_reorder.at("ok") == false);
  CHECK(partial_reorder.at("error").at("code") ==
        "logic_control_atomic_required");

  const Json updated = request(
      backend,
      11,
      "cgDisplay.update",
      {{"sceneId", scene_id},
       {"nodeId", display_id},
       {"assetId", "asset-image-1"},
       {"leadInMs", 60000}});
  expect_session(updated, 4, 0, true);
  const Json moved_complete = request(
      backend,
      12,
      "timeline.reorderMany",
      {{"sceneId", scene_id},
       {"nodeIds", Json::array({display_id, dialogue_id, end_display_id})},
       {"beforeNodeId", end_if_id}});
  expect_session(moved_complete, 5, 0, true);
  const Json moved_display = request(
      backend,
      13,
      "cgDisplay.reorder",
      {{"sceneId", scene_id},
       {"nodeId", display_id},
       {"beforeNodeId", "dialogue-1"}});
  expect_session(moved_display, 6, 0, true);

  const Json saved = request(
      backend, 14, "project.save", {{"filePath", target.string()}});
  expect_session(saved, 6, 6, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 21);
  const auto parsed = vnengine::backend::project_file_from_json(persisted);
  CHECK(std::holds_alternative<vnengine::CgDisplayNode>(
      parsed.project.scenes[0].nodes[0]));
  CHECK(std::get<vnengine::CgDisplayNode>(
            parsed.project.scenes[0].nodes[0]).lead_in_ms == 60000);
  CHECK(vnengine::backend::project_file_to_json(parsed) == persisted);

  vnengine::backend::Backend reopened;
  const Json reopened_result = request(
      reopened, 1, "project.open", {{"contents", persisted.dump()}});
  expect_session(reopened_result, 0, 0, false);
  const Json deleted = request(
      reopened,
      2,
      "cgDisplay.delete",
      {{"sceneId", scene_id}, {"nodeId", display_id}});
  expect_session(deleted, 1, 0, true);
  const Json& remaining = deleted.at("result")
      .at("project")
      .at("scenes")[0]
      .at("nodes");
  CHECK(std::none_of(
      remaining.begin(), remaining.end(), [&](const Json& node) {
        return node.at("id") == display_id ||
            node.at("id") == dialogue_id ||
            node.at("id") == end_display_id;
      }));

  Json malformed = persisted;
  malformed["project"]["scenes"][0]["nodes"][0]["leadInMs"] = 1.5;
  expect_file_error(
      malformed, vnengine::backend::ProjectFileErrorKind::invalid_document);
  malformed = persisted;
  malformed["project"]["scenes"][0]["nodes"].insert(
      malformed["project"]["scenes"][0]["nodes"].begin() + 1,
      {{"id", "background-inside"},
       {"type", "background"},
       {"assetId", nullptr},
       {"scalePercent", 100}});
  expect_file_error(
      malformed, vnengine::backend::ProjectFileErrorKind::invalid_document);
  malformed = persisted;
  malformed["fileVersion"] = 16;
  malformed["project"]["startScreen"].erase("eyebrow");
  malformed["project"]["scenes"][0]["visuals"].erase(
      "backgroundScalePercent");
  expect_file_error(
      malformed, vnengine::backend::ProjectFileErrorKind::unsupported_format);
}

void reorders_complete_logic_story_pages_via_protocol() {
  vnengine::backend::Backend backend;
  const Json created = request(
      backend, 1, "project.create", {{"name", "Logic page reorder"}});
  const std::string scene_id = created.at("result")
      .at("project")
      .at("entrySceneId")
      .get<std::string>();

  const Json head = request(
      backend,
      2,
      "dialogue.add",
      {{"sceneId", scene_id}, {"speaker", "旁白"}, {"text", "第一页"}});
  const std::string head_id =
      head.at("result").at("nodeId").get<std::string>();
  const Json page_start = request(
      backend, 3, "storyExtension.add", {{"sceneId", scene_id}});
  const std::string page_start_id =
      page_start.at("result").at("nodeId").get<std::string>();
  const Json added_if = request(
      backend,
      4,
      "logicIf.add",
      {{"sceneId", scene_id},
       {"condition",
        {{"left", {{"kind", "literal"}, {"value", true}}},
         {"operator", "eq"},
         {"right", {{"kind", "literal"}, {"value", true}}}}}});
  const std::string if_id =
      added_if.at("result").at("nodeId").get<std::string>();
  const Json& if_nodes = added_if.at("result")
      .at("project")
      .at("scenes")[0]
      .at("nodes");
  const auto node_id_with_type = [](const Json& nodes,
                                    const std::string_view type) {
    const auto found = std::find_if(
        nodes.begin(), nodes.end(), [type](const Json& node) {
          return node.at("type").get<std::string>() == type;
        });
    if (found == nodes.end()) {
      throw std::runtime_error("expected timeline node type");
    }
    return found->at("id").get<std::string>();
  };
  const std::string else_id = node_id_with_type(if_nodes, "logicElse");
  const std::string end_if_id = node_id_with_type(if_nodes, "logicEndIf");

  const Json added_repeat = request(
      backend,
      5,
      "logicRepeat.add",
      {{"sceneId", scene_id}, {"count", 2}, {"beforeNodeId", else_id}});
  const std::string repeat_id =
      added_repeat.at("result").at("nodeId").get<std::string>();
  const std::string end_repeat_id = node_id_with_type(
      added_repeat.at("result").at("project").at("scenes")[0].at("nodes"),
      "logicEndRepeat");
  const Json repeat_body = request(
      backend,
      6,
      "dialogue.add",
      {{"sceneId", scene_id},
       {"speaker", "旁白"},
       {"text", "循环内"},
       {"beforeNodeId", end_repeat_id}});
  const std::string repeat_body_id =
      repeat_body.at("result").at("nodeId").get<std::string>();
  const Json else_body = request(
      backend,
      7,
      "dialogue.add",
      {{"sceneId", scene_id},
       {"speaker", "旁白"},
       {"text", "否则"},
       {"beforeNodeId", end_if_id}});
  const std::string else_body_id =
      else_body.at("result").at("nodeId").get<std::string>();
  const Json next_page = request(
      backend, 8, "storyExtension.add", {{"sceneId", scene_id}});
  const std::string next_page_id =
      next_page.at("result").at("nodeId").get<std::string>();
  request(
      backend,
      9,
      "dialogue.add",
      {{"sceneId", scene_id}, {"speaker", "旁白"}, {"text", "第三页"}});

  const Json moved_leaf = request(
      backend,
      10,
      "timeline.reorder",
      {{"sceneId", scene_id},
       {"nodeId", repeat_body_id},
       {"beforeNodeId", head_id}});
  expect_session(moved_leaf, 9, std::nullopt, true);
  CHECK(moved_leaf.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[0]
            .at("id") == repeat_body_id);
  expect_session(
      request(
          backend,
          11,
          "timeline.reorder",
          {{"sceneId", scene_id},
           {"nodeId", repeat_body_id},
           {"beforeNodeId", end_repeat_id}}),
      10,
      std::nullopt,
      true);

  const std::vector<std::string> nested_control{
      repeat_id, repeat_body_id, end_repeat_id};
  const Json moved_nested = request(
      backend,
      12,
      "timeline.reorderMany",
      {{"sceneId", scene_id},
       {"nodeIds", nested_control},
       {"beforeNodeId", head_id}});
  expect_session(moved_nested, 11, std::nullopt, true);
  for (std::size_t index = 0; index < nested_control.size(); ++index) {
    CHECK(moved_nested.at("result")
              .at("project")
              .at("scenes")[0]
              .at("nodes")[index]
              .at("id") == nested_control[index]);
  }
  expect_session(
      request(
          backend,
          13,
          "timeline.reorderMany",
          {{"sceneId", scene_id},
           {"nodeIds", nested_control},
           {"beforeNodeId", else_id}}),
      12,
      std::nullopt,
      true);

  const std::vector<std::string> complete_page{
      page_start_id,
      if_id,
      repeat_id,
      repeat_body_id,
      end_repeat_id,
      else_id,
      else_body_id,
      end_if_id,
  };
  const Json moved_page = request(
      backend,
      14,
      "timeline.reorderMany",
      {{"sceneId", scene_id},
       {"nodeIds", complete_page},
       {"beforeNodeId", head_id}});
  expect_session(moved_page, 13, std::nullopt, true);
  for (std::size_t index = 0; index < complete_page.size(); ++index) {
    CHECK(moved_page.at("result")
              .at("project")
              .at("scenes")[0]
              .at("nodes")[index]
              .at("id") == complete_page[index]);
  }

  const auto without_id = [](const std::vector<std::string>& ids,
                             const std::string_view omitted) {
    std::vector<std::string> result;
    std::copy_if(
        ids.begin(),
        ids.end(),
        std::back_inserter(result),
        [omitted](const std::string& id) { return id != omitted; });
    return result;
  };
  const std::vector<std::vector<std::string>> partial_selections{
      without_id(complete_page, if_id),
      without_id(complete_page, end_repeat_id),
      without_id(complete_page, repeat_body_id),
      {repeat_id, repeat_body_id},
  };
  int request_id = 15;
  for (const std::vector<std::string>& selection : partial_selections) {
    const Json rejected = request(
        backend,
        request_id++,
        "timeline.reorderMany",
        {{"sceneId", scene_id},
         {"nodeIds", selection},
         {"beforeNodeId", head_id}});
    CHECK(rejected.at("ok") == false);
    CHECK(rejected.at("error").at("code") ==
          "logic_control_atomic_required");
  }
  const Json selected_anchor = request(
      backend,
      request_id++,
      "timeline.reorderMany",
      {{"sceneId", scene_id},
       {"nodeIds", complete_page},
       {"beforeNodeId", repeat_id}});
  CHECK(selected_anchor.at("ok") == false);
  CHECK(selected_anchor.at("error").at("code") == "invalid_params");

  const Json unchanged = request(backend, request_id, "project.get");
  expect_session(unchanged, 13, std::nullopt, true);
  CHECK(unchanged.at("result").at("project") ==
        moved_page.at("result").at("project"));
  CHECK(unchanged.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[complete_page.size() + 1]
            .at("id") == next_page_id);
}

}  // namespace

int main() {
  const std::vector<std::pair<std::string, std::function<void()>>> tests{
      {"reads v1 and writes a migrated v21 document",
       reads_v1_and_writes_a_migrated_v21_document},
      {"round trips v2 visuals and preserves character order",
       round_trips_v2_visuals_and_preserves_character_order},
      {"migrates and round trips v21 image scales strictly",
       migrates_and_round_trips_v21_image_scales_strictly},
      {"v1 reader rejects unversioned visual fields",
       v1_reader_rejects_unversioned_visual_fields},
      {"rejects unsupported and malformed project documents",
       rejects_unsupported_and_malformed_project_documents},
      {"rejects malformed v2 visual fields strictly",
       rejects_malformed_v2_visual_fields_strictly},
      {"round trips v3 mixed timeline strictly",
       round_trips_v3_mixed_timeline_strictly},
      {"migrates v1 through v6 dialogues to null voice",
       migrates_v1_through_v6_dialogues_to_null_voice},
      {"round trips v7 audio timeline strictly",
       round_trips_v7_audio_timeline_strictly},
      {"round trips v8 video timeline strictly",
       round_trips_v8_video_timeline_strictly},
      {"round trips v9 choice timeline strictly",
       round_trips_v9_choice_timeline_strictly},
      {"migrates legacy start screens and round trips v14 strictly",
       migrates_legacy_start_screens_and_round_trips_v14_strictly},
      {"round trips v14 story extensions strictly",
       round_trips_v14_story_extensions_strictly},
      {"migrates v14 and v15 CG pages to v19 strictly",
       migrates_v14_and_v15_cg_pages_to_v16_strictly},
      {"migrates and round trips v18 character effects strictly",
       migrates_and_round_trips_v18_character_effects_strictly},
      {"migrates legacy character nulls and round trips v19 modes strictly",
       migrates_legacy_character_nulls_and_round_trips_v19_modes_strictly},
      {"tracks real mutations and normalizes project names",
       tracks_real_mutations_and_normalizes_project_names},
      {"normalizes scene names and rejects blank commands atomically",
       normalizes_scene_names_and_rejects_blank_commands_atomically},
      {"accepts and persists empty dialogue fields",
       accepts_and_persists_empty_dialogue_fields},
      {"imports an image without exposing paths or autosaving manifest",
       imports_an_image_without_exposing_paths_or_autosaving_manifest},
      {"imports a video transactionally without exposing paths",
       imports_a_video_transactionally_without_exposing_paths},
      {"imports audio transactionally without exposing paths",
       imports_audio_transactionally_without_exposing_paths},
      {"rejects unsafe image sources without mutating document",
       rejects_unsafe_image_sources_without_mutating_document},
      {"sets clears and persists scene backgrounds atomically",
       sets_clears_and_persists_scene_backgrounds_atomically},
      {"updates and persists start screen atomically",
       updates_and_persists_start_screen_atomically},
      {"updates and persists CG gallery atomically",
       updates_and_persists_cg_gallery_atomically},
      {"mutates and persists mixed background timeline",
       mutates_and_persists_mixed_background_timeline},
      {"saves atomically and round trips assets",
       saves_atomically_and_round_trips_assets},
      {"backend preserves hidden v2 visuals across mutation and save",
       backend_preserves_hidden_v2_visuals_across_mutation_and_save},
      {"failed open preserves dirty hidden v2 aggregate",
       failed_open_preserves_dirty_hidden_v2_aggregate},
      {"failed save preserves state and destination",
       failed_save_preserves_state_and_destination},
      {"opens manifest contents and preserves current project after failures",
       opens_a_file_and_preserves_current_project_after_failures},
      {"failed open does not create a project",
       failed_open_does_not_create_a_project},
      {"rejects project contents over size limit",
       rejects_project_contents_over_size_limit},
      {"mutates and persists character timeline",
       mutates_and_persists_character_timeline},
      {"mutates and persists character modes atomically",
       mutates_and_persists_character_modes_atomically},
      {"mutates moves and persists character effects atomically",
       mutates_moves_and_persists_character_effects_atomically},
      {"mutates and persists scene jump timeline",
       mutates_and_persists_scene_jump_timeline},
      {"mutates and persists choice timeline transactionally",
       mutates_and_persists_choice_timeline_transactionally},
      {"mutates and persists dialogue voice and BGM",
       mutates_and_persists_dialogue_voice_and_bgm},
      {"mutates and persists video timeline",
       mutates_and_persists_video_timeline},
      {"mutates and persists story extension timeline",
       mutates_and_persists_story_extension_timeline},
      {"mutates persists and guards logic timeline",
       mutates_persists_and_guards_logic_timeline},
      {"mutates persists and guards CG display timeline",
       mutates_persists_and_guards_cg_display_timeline},
      {"reorders complete logic story pages via protocol",
       reorders_complete_logic_story_pages_via_protocol},
  };

  int failures = 0;
  for (const auto& [name, test] : tests) {
    try {
      test();
      std::cout << "[PASS] " << name << '\n';
    } catch (const std::exception& error) {
      ++failures;
      std::cerr << "[FAIL] " << name << ": " << error.what() << '\n';
    }
  }

  if (failures != 0) {
    std::cerr << failures << " test(s) failed\n";
    return 1;
  }

  std::cout << tests.size() << " test(s) passed\n";
  return 0;
}
