#include <algorithm>
#include <array>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iostream>
#include <iterator>
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

void reads_v1_and_writes_a_migrated_v15_document() {
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
  CHECK(!parsed.project.start_screen.background_asset_id.has_value());
  CHECK(!parsed.project.start_screen.music_asset_id.has_value());
  CHECK(parsed.assets.size() == 2);
  CHECK(parsed.assets[0].type == vnengine::AssetType::image);
  CHECK(parsed.assets[1].type == vnengine::AssetType::video);
  CHECK(
      vnengine::backend::project_file_to_json(parsed) ==
      migrated_v15_document());
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
  Json expected = migrated_to_v15(source);
  CHECK(vnengine::backend::project_file_to_json(parsed) == expected);
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
  document["fileVersion"] = 16;
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
  Json migrated_source = migrated_to_v15(source);
  CHECK(vnengine::backend::project_file_to_json(parsed) == migrated_source);

  Json no_background_source = migrated_to_v15(source);
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
    CHECK(migrated.at("fileVersion") == 15);
    CHECK(migrated.at("project").at("startScreen") == Json({
        {"title", "读取的项目"},
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
  Json migrated = with_v15_cg_pages(
      with_v14_cg_gallery(with_v13_start_screen(source)));
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
  Json migrated = with_v15_cg_pages(
      with_v14_cg_gallery(with_v13_start_screen(source)));
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
      with_v15_cg_pages(
          with_v14_cg_gallery(with_v13_start_screen(source))));
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
  };
  for (const Json& legacy : legacy_documents) {
    const auto parsed = vnengine::backend::project_file_from_json(legacy);
    CHECK(parsed.project.start_screen.title == parsed.project.name);
    CHECK(!parsed.project.start_screen.background_asset_id.has_value());
    CHECK(!parsed.project.start_screen.music_asset_id.has_value());
    const Json migrated = vnengine::backend::project_file_to_json(parsed);
    CHECK(migrated.at("fileVersion") == 15);
    CHECK(migrated.at("project").at("startScreen") == Json({
        {"title", "读取的项目"},
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
  expected_migration["fileVersion"] = 15;
  expected_migration["project"]["startScreen"]["title"] = "读取的项目";
  expected_migration["project"]["cgGallery"] =
      migrated_v15_document().at("project").at("cgGallery");
  CHECK(vnengine::backend::project_file_to_json(migrated_v10) ==
        expected_migration);

  Json malformed = legacy_v10;
  malformed["project"]["startScreen"]["title"] = "v10 不允许该字段";
  expect_file_error(malformed, Kind::invalid_document);

  Json source = expected_migration;
  source["project"]["startScreen"]["title"] = "自定义标题";

  const auto parsed = vnengine::backend::project_file_from_json(source);
  CHECK(parsed.project.start_screen.title == "自定义标题");
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
       {"title", "backgroundAssetId", "musicAssetId"}) {
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
  CHECK(source == migrated_to_v15(legacy_v12));
  source["project"]["scenes"][0]["nodes"].push_back({
      {"id", "custom-character"},
      {"type", "character"},
      {"assetId", "asset-image-1"},
      {"slot", "left"},
      {"layer", 2},
      {"position", {{"x", 32.5}, {"y", 86.0}}},
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

void migrates_v14_and_round_trips_v15_cg_pages_strictly() {
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
        with_v15_cg_pages(legacy));

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
  CHECK(vnengine::backend::project_file_to_json(parsed) == source);
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
    CHECK(project.at("startScreen").size() == 3);
    CHECK(project.at("startScreen").contains("title"));
    CHECK(project.at("startScreen").at("title").is_string());
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
  Json source_document = migrated_v15_document();
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
  CHECK(persisted.at("fileVersion") == 15);
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

  // project.get uses the same public projection as every mutation response.
  const Json initial_snapshot = request(backend, 2, "project.get");
  expect_session(initial_snapshot, 0, 0, false);
  CHECK(initial_snapshot.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundAssetId")
            .is_null());

  const Json assigned = request(
      backend,
      3,
      "scene.setBackground",
      {{"sceneId", "scene-1"}, {"assetId", "asset-image-1"}});
  expect_session(assigned, 1, 0, true);
  CHECK(assigned.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundAssetId") == "asset-image-1");

  // Assigning the authoritative value again is a successful no-op.
  const Json same_assignment = request(
      backend,
      4,
      "scene.setBackground",
      {{"sceneId", "scene-1"}, {"assetId", "asset-image-1"}});
  expect_session(same_assignment, 1, 0, true);

  int request_id = 5;
  const std::vector<std::pair<Json, std::string>> invalid_changes{
      {{{"sceneId", "missing-scene"}, {"assetId", "asset-image-1"}},
       "scene_not_found"},
      {{{"sceneId", "scene-1"}, {"assetId", "missing-asset"}},
       "asset_not_found"},
      {{{"sceneId", "scene-1"}, {"assetId", "asset-video-1"}},
       "asset_not_image"},
      {{{"sceneId", "scene-1"}}, "invalid_params"},
      {{{"sceneId", "scene-1"}, {"assetId", 7}}, "invalid_params"},
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
  }

  const Json cleared = request(
      backend,
      request_id++,
      "scene.setBackground",
      {{"sceneId", "scene-1"}, {"assetId", nullptr}});
  expect_session(cleared, 2, 0, true);
  CHECK(cleared.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundAssetId")
            .is_null());

  const Json same_clear = request(
      backend,
      request_id++,
      "scene.setBackground",
      {{"sceneId", "scene-1"}, {"assetId", nullptr}});
  expect_session(same_clear, 2, 0, true);

  const Json reassigned = request(
      backend,
      request_id++,
      "scene.setBackground",
      {{"sceneId", "scene-1"}, {"assetId", "asset-image-1"}});
  expect_session(reassigned, 3, 0, true);

  const Json saved = request(
      backend,
      request_id++,
      "project.save",
      {{"filePath", target.string()}});
  expect_session(saved, 3, 3, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 15);
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("visuals")
            .at("backgroundAssetId") == "asset-image-1");

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
                {"backgroundAssetId", nullptr},
                {"musicAssetId", nullptr},
            }));

  const Json assigned = request(
      backend,
      2,
      "startScreen.update",
      {{"title", "  自定义标题  "},
       {"backgroundAssetId", "asset-image-1"},
       {"musicAssetId", "asset-audio-1"}});
  expect_session(assigned, 1, 0, true);
  const Json expected_screen{
      {"title", "自定义标题"},
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
       {"backgroundAssetId", "asset-image-1"},
       {"musicAssetId", "asset-audio-1"}});
  expect_session(same_assignment, 1, 0, true);

  const std::vector<std::pair<Json, std::string>> invalid_changes{
      {{{"musicAssetId", "asset-audio-1"}}, "invalid_params"},
      {{{"backgroundAssetId", "asset-image-1"}}, "invalid_params"},
      {{{"title", "自定义标题"},
        {"backgroundAssetId", "asset-image-1"},
        {"musicAssetId", "asset-audio-1"},
        {"unexpected", true}},
       "invalid_params"},
      {{{"title", 7},
        {"backgroundAssetId", nullptr},
        {"musicAssetId", nullptr}},
       "invalid_params"},
      {{{"title", "自定义标题"},
        {"backgroundAssetId", 7},
        {"musicAssetId", nullptr}},
       "invalid_params"},
      {{{"title", "自定义标题"},
        {"backgroundAssetId", nullptr},
        {"musicAssetId", false}},
       "invalid_params"},
      {{{"title", "   "},
        {"backgroundAssetId", nullptr},
        {"musicAssetId", nullptr}},
       "start_screen_title_required"},
      {{{"title", "不应提交"},
        {"backgroundAssetId", "missing"},
        {"musicAssetId", "asset-audio-1"}},
       "asset_not_found"},
      {{{"title", "不应提交"},
        {"backgroundAssetId", "asset-video-1"},
        {"musicAssetId", "asset-audio-1"}},
       "asset_not_image"},
      {{{"title", "不应提交"},
        {"backgroundAssetId", nullptr},
        {"musicAssetId", "missing"}},
       "asset_not_found"},
      {{{"title", "不应提交"},
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
       {"backgroundAssetId", nullptr},
       {"musicAssetId", nullptr}});
  expect_session(cleared, 2, 0, true);
  const Json same_clear = request(
      backend,
      request_id++,
      "startScreen.update",
      {{"title", "自定义标题"},
       {"backgroundAssetId", nullptr},
       {"musicAssetId", nullptr}});
  expect_session(same_clear, 2, 0, true);

  const Json reassigned = request(
      backend,
      request_id++,
      "startScreen.update",
      {{"title", "自定义标题"},
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
  CHECK(persisted.at("fileVersion") == 15);
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
  }));

  const Json filled = request(
      backend,
      3,
      "background.update",
      {
          {"sceneId", "scene-1"},
          {"nodeId", background_id},
          {"assetId", "asset-image-1"},
      });
  expect_session(filled, 2, 0, true);

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
  CHECK(persisted.at("fileVersion") == 15);
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
  CHECK(on_disk.at("fileVersion") == 15);
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
  CHECK(persisted.at("fileVersion") == 15);
  CHECK(
      persisted.at("project").at("scenes")[0].at("visuals") ==
      source_document.at("project").at("scenes")[0].at("visuals"));
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
  future_document["fileVersion"] = 16;
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
  CHECK(persisted.at("fileVersion") == 15);
  CHECK(persisted.at("project").at("name") == "失败后仍保留");
  CHECK(
      persisted.at("project").at("scenes")[0].at("visuals") ==
      source_document.at("project").at("scenes")[0].at("visuals"));
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
      {{"sceneId", "scene-1"}, {"afterNodeId", "dialogue-1"}});
  expect_session(added, 1, 0, true);
  const std::string node_id =
      added.at("result").at("nodeId").get<std::string>();
  const Json& empty = added.at("result")
                          .at("project")
                          .at("scenes")[0]
                          .at("nodes")[1];
  CHECK(empty == Json({
      {"id", node_id},
      {"type", "character"},
      {"assetId", nullptr},
      {"slot", "center"},
      {"layer", 1},
      {"position", nullptr},
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
          {"position", {{"x", 50}, {"y", 101}}},
      });
  CHECK(invalid_position.at("ok") == false);
  CHECK(invalid_position.at("error").at("code") == "invalid_params");

  const Json saved = request(
      backend,
      6,
      "project.save",
      {{"filePath", target.string()}});
  expect_session(saved, 2, 2, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 15);
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("assetId") == "asset-image-1");

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
            .at("position") == Json({{"x", 27.5}, {"y", 91.0}}));
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
  CHECK(persisted.at("fileVersion") == 15);
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
  CHECK(persisted.at("fileVersion") == 15);
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
  CHECK(persisted.at("fileVersion") == 15);
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
  CHECK(persisted.at("fileVersion") == 15);
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
  CHECK(persisted.at("fileVersion") == 15);
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

}  // namespace

int main() {
  const std::vector<std::pair<std::string, std::function<void()>>> tests{
      {"reads v1 and writes a migrated v15 document",
       reads_v1_and_writes_a_migrated_v15_document},
      {"round trips v2 visuals and preserves character order",
       round_trips_v2_visuals_and_preserves_character_order},
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
      {"migrates v14 and round trips v15 CG pages strictly",
       migrates_v14_and_round_trips_v15_cg_pages_strictly},
      {"tracks real mutations and normalizes project names",
       tracks_real_mutations_and_normalizes_project_names},
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
